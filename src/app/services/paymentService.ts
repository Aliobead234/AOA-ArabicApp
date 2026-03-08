/// <reference types="vite/client" />

import { apiRequest } from "./api";
import * as authService from "./auth";

export interface PaymentOrder {
  orderId: string;
  amount: number;
  currency: string;
  planName: string;
  period: string;
  status: string;
  expiresAt: string;
  paymentComment: string;
  recipient?: {
    phone: string;
    bankName: string;
    name: string;
  };
  qrPayload?: string;
  qrUrl?: string;
  qrImageUrl?: string;
  providerOrderId?: string;
  providerStatus?: string;
  token?: string;
  createdAt?: string;
  confirmedAt?: string | null;
  verifiedAt?: string | null;
}

export interface PaymentOrderCreateResponse extends PaymentOrder {
  recipient: {
    phone: string;
    bankName: string;
    name: string;
  };
  token: string;
}

export interface Subscription {
  userId: string;
  planId: string;
  planName: string;
  status: string;
  orderId: string;
  activatedAt: string;
  expiresAt: string | null;
}

export interface SubscriptionResponse {
  subscription: Subscription | null;
}

type PaymentBackendMode = "supabase" | "microservice" | "hybrid";
type PaymentErrorSource = "microservice" | "supabase" | "client";

interface PaymentRequestError extends Error {
  status?: number;
  source?: PaymentErrorSource;
  fallbackEligible?: boolean;
}

const DEFAULT_BACKEND_MODE: PaymentBackendMode = import.meta.env.DEV
  ? "microservice"
  : "supabase";

const PAYMENT_BACKEND_MODE = (import.meta.env.VITE_PAYMENT_BACKEND_MODE ??
  DEFAULT_BACKEND_MODE) as PaymentBackendMode;

const DEFAULT_MICRO_BASE_URL = import.meta.env.DEV ? "http://localhost:8081" : "";

const PAYMENT_MICRO_BASE_URL = (
  import.meta.env.VITE_PAYMENT_MICRO_BASE_URL ?? DEFAULT_MICRO_BASE_URL
).replace(/\/$/, "");

const PAYMENT_MICRO_TIMEOUT_MS = Number(
  import.meta.env.VITE_PAYMENT_MICRO_TIMEOUT_MS ?? 8000,
);

function shouldTryMicroservice(): boolean {
  return (
    !!PAYMENT_MICRO_BASE_URL &&
    (PAYMENT_BACKEND_MODE === "microservice" ||
      PAYMENT_BACKEND_MODE === "hybrid")
  );
}

function shouldFallbackToSupabase(): boolean {
  return PAYMENT_BACKEND_MODE === "hybrid";
}

async function getFreshToken(): Promise<string> {
  const token = await authService.getAccessToken();
  if (token) {
    return token;
  }

  const refreshed = await authService.refreshAccessToken();
  if (refreshed) {
    return refreshed;
  }

  throw createPaymentRequestError(
    "Session expired or invalid. Please sign in again.",
    401,
    "client",
    false,
  );
}

function createPaymentRequestError(
  message: string,
  status: number | undefined,
  source: PaymentErrorSource,
  fallbackEligible: boolean,
): PaymentRequestError {
  const error = new Error(message) as PaymentRequestError;
  error.status = status;
  error.source = source;
  error.fallbackEligible = fallbackEligible;
  return error;
}

function isFallbackEligibleError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return true;
  }

  const typed = error as PaymentRequestError;
  if (typeof typed.fallbackEligible === "boolean") {
    return typed.fallbackEligible;
  }

  if (typeof typed.status === "number") {
    return typed.status >= 500;
  }

  return true;
}

async function microserviceRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (!PAYMENT_MICRO_BASE_URL) {
    throw createPaymentRequestError(
      "VITE_PAYMENT_MICRO_BASE_URL is not configured",
      500,
      "client",
      false,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYMENT_MICRO_TIMEOUT_MS);

  try {
    const send = async (token: string) =>
      fetch(`${PAYMENT_MICRO_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

    let token = await getFreshToken();
    let res = await send(token);

    if (res.status === 401) {
      const refreshed = await authService.refreshAccessToken();
      if (refreshed) {
        token = refreshed;
        res = await send(token);
      }
    }

    if (!res.ok) {
      const text = await res.text();
      const errorMessage = extractErrorMessage(text);

      if (res.status === 401 && isAuthErrorMessage(errorMessage)) {
        throw createPaymentRequestError(
          "Session expired or invalid. Please sign in again.",
          401,
          "microservice",
          false,
        );
      }

      if (res.status === 503) {
        throw createPaymentRequestError(
          "Payment service is temporarily unavailable. Please try again in a minute.",
          503,
          "microservice",
          true,
        );
      }

      throw createPaymentRequestError(
        errorMessage || `Payment microservice error: ${res.status}`,
        res.status,
        "microservice",
        res.status >= 500,
      );
    }

    return (await res.json()) as T;
  } catch (error) {
    if ((error as PaymentRequestError)?.source) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw createPaymentRequestError(
        "Payment service timed out. Please try again.",
        504,
        "microservice",
        true,
      );
    }

    throw createPaymentRequestError(
      "Payment service is unavailable. Please try again.",
      undefined,
      "microservice",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractErrorMessage(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: string; message?: string };
    const message = parsed.error ?? parsed.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  } catch {
    // Non-JSON response.
  }

  return trimmed;
}

function isAuthErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid jwt") ||
    normalized.includes("invalid auth token") ||
    normalized.includes("auth token expired") ||
    normalized.includes("invalid or expired auth token")
  );
}

async function withPaymentBackendFallback<T>(
  microserviceCall: () => Promise<T>,
  supabaseCall: () => Promise<T>,
): Promise<T> {
  if (!shouldTryMicroservice()) {
    return supabaseCall();
  }

  try {
    return await microserviceCall();
  } catch (error) {
    if (!shouldFallbackToSupabase() || !isFallbackEligibleError(error)) {
      throw error;
    }

    console.warn(
      "Payment microservice request failed, falling back to Supabase Edge Function:",
      error,
    );

    return supabaseCall();
  }
}

export async function createSbpOrder(
  planId: string,
): Promise<PaymentOrderCreateResponse> {
  return withPaymentBackendFallback(
    () =>
      microserviceRequest<PaymentOrderCreateResponse>("/api/v1/orders", {
        method: "POST",
        body: { planId },
      }),
    async () =>
      apiRequest<PaymentOrderCreateResponse>("/orders/create", {
        method: "POST",
        body: { planId },
        accessToken: await getFreshToken(),
      }),
  );
}

export async function getSbpOrder(orderId: string): Promise<PaymentOrder> {
  return withPaymentBackendFallback(
    () => microserviceRequest<PaymentOrder>(`/api/v1/orders/${orderId}`),
    async () =>
      apiRequest<PaymentOrder>(`/orders/${orderId}`, {
        accessToken: await getFreshToken(),
      }),
  );
}

export async function confirmSbpOrder(
  orderId: string,
  token: string,
): Promise<{ orderId: string; status: string; message: string }> {
  return withPaymentBackendFallback(
    () =>
      microserviceRequest<{ orderId: string; status: string; message: string }>(
        `/api/v1/orders/${orderId}/confirm`,
        { method: "POST", body: { token } },
      ),
    async () =>
      apiRequest<{ orderId: string; status: string; message: string }>(
        `/orders/${orderId}/confirm`,
        {
          method: "POST",
          body: { token },
          accessToken: await getFreshToken(),
        },
      ),
  );
}

export async function getCurrentSubscription(): Promise<SubscriptionResponse> {
  return withPaymentBackendFallback(
    () => microserviceRequest<SubscriptionResponse>("/api/v1/subscription"),
    async () =>
      apiRequest<SubscriptionResponse>("/subscription", {
        accessToken: await getFreshToken(),
      }),
  );
}
