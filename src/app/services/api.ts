// API service - all server calls go through here
// Easy to swap base URL when migrating to Go + Railway
import * as authService from './auth';

const BASE_URL = `https://xmhqgwrwezonofhvukpp.supabase.co/functions/v1/make-server-205d64da`;

interface RequestOptions {
  method?: string;
  body?: unknown;
  accessToken?: string;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, accessToken } = options;

  const send = async (token: string) =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let bearerToken = accessToken ?? (await authService.getAccessToken());
  if (!bearerToken) {
    throw new Error('Session expired or invalid. Please sign in again.');
  }

  let res = await send(bearerToken);

  if (res.status === 401) {
    const refreshedToken = await authService.refreshAccessToken();
    if (refreshedToken) {
      bearerToken = refreshedToken;
      res = await send(bearerToken);
    }
  }

  if (!res.ok) {
    const errorText = await res.text();
    const errorMessage = extractApiErrorMessage(errorText);
    console.error(`API error [${res.status}] ${path}:`, errorMessage || errorText);
    if (res.status === 401 && isAuthErrorMessage(errorMessage)) {
      throw new Error('Session expired or invalid. Please sign in again.');
    }
    if (res.status === 503) {
      throw new Error('Payment service is temporarily unavailable. Please try again in a minute.');
    }
    throw new Error(errorMessage || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

function extractApiErrorMessage(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: string; message?: string };
    const message = parsed.error ?? parsed.message;
    if (typeof message === 'string' && message.trim()) {
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
    normalized.includes('invalid jwt') ||
    normalized.includes('invalid auth token') ||
    normalized.includes('auth token expired') ||
    normalized.includes('invalid or expired auth token')
  );
}
