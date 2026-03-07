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
  token?: string;
  createdAt?: string;
  confirmedAt?: string | null;
  verifiedAt?: string | null;
}

export interface PaymentOrderCreateResponse
  extends PaymentOrder {
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

const PAYMENT_BACKEND_MODE = (import.meta.env
  .VITE_PAYMENT_BACKEND_MODE ??
  "supabase") as PaymentBackendMode;
const PAYMENT_MICRO_BASE_URL = (
  import.meta.env.VITE_PAYMENT_MICRO_BASE_URL ?? ""
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

async function microserviceRequest<T>(
  path: string,
  accessToken: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  if (!PAYMENT_MICRO_BASE_URL) {
    throw new Error(
      "VITE_PAYMENT_MICRO_BASE_URL is not configured",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PAYMENT_MICRO_TIMEOUT_MS,
  );

  try {
    const send = async (token: string) =>
      fetch(`${PAYMENT_MICRO_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: options.body
          ? JSON.stringify(options.body)
          : undefined,
        signal: controller.signal,
      });

    let token = accessToken;
    let res = await send(token);

    if (res.status === 401) {
      const refreshedToken = await authService.refreshAccessToken();
      if (refreshedToken && refreshedToken !== token) {
        token = refreshedToken;
        res = await send(token);
      }
    }

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 && /invalid jwt/i.test(text)) {
        throw new Error("Session expired or invalid. Please sign in again.");
      }
      throw new Error(
        text || `Payment microservice error: ${res.status}`,
      );
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
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
    if (!shouldFallbackToSupabase()) {
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
  accessToken: string,
): Promise<PaymentOrderCreateResponse> {
  return withPaymentBackendFallback(
    () =>
      microserviceRequest<PaymentOrderCreateResponse>(
        "/api/v1/orders",
        accessToken,
        {
          method: "POST",
          body: { planId },
        },
      ),
    () =>
      apiRequest<PaymentOrderCreateResponse>("/orders/create", {
        method: "POST",
        body: { planId },
        accessToken,
      }),
  );
}

export async function getSbpOrder(
  orderId: string,
  accessToken: string,
): Promise<PaymentOrder> {
  return withPaymentBackendFallback(
    () =>
      microserviceRequest<PaymentOrder>(
        `/api/v1/orders/${orderId}`,
        accessToken,
      ),
    () =>
      apiRequest<PaymentOrder>(`/orders/${orderId}`, {
        accessToken,
      }),
  );
}

export async function confirmSbpOrder(
  orderId: string,
  token: string,
  accessToken: string,
): Promise<{ orderId: string; status: string; message: string }> {
  return withPaymentBackendFallback(
    () =>
      microserviceRequest<{
        orderId: string;
        status: string;
        message: string;
      }>(`/api/v1/orders/${orderId}/confirm`, accessToken, {
        method: "POST",
        body: { token },
      }),
    () =>
      apiRequest<{
        orderId: string;
        status: string;
        message: string;
      }>(`/orders/${orderId}/confirm`, {
        method: "POST",
        body: { token },
        accessToken,
      }),
  );
}

export async function getCurrentSubscription(
  accessToken: string,
): Promise<SubscriptionResponse> {
  return withPaymentBackendFallback(
    () =>
      microserviceRequest<SubscriptionResponse>(
        "/api/v1/subscription",
        accessToken,
      ),
    () =>
      apiRequest<SubscriptionResponse>("/subscription", {
        accessToken,
      }),
  );
}
