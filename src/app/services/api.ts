// API service - all server calls go through here
// Easy to swap base URL when migrating to Go + Railway
import { projectId, publicAnonKey } from '/utils/supabase/info';
import * as authService from './auth';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-205d64da`;

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

  let bearerToken =
    accessToken ?? (await authService.getAccessToken()) ?? publicAnonKey;

  let res = await send(bearerToken);

  if (res.status === 401 && accessToken) {
    const refreshedToken = await authService.refreshAccessToken();
    if (refreshedToken && refreshedToken !== bearerToken) {
      bearerToken = refreshedToken;
      res = await send(bearerToken);
    }
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`API error [${res.status}] ${path}:`, errorText);
    if (res.status === 401 && /invalid jwt/i.test(errorText)) {
      throw new Error('Session expired or invalid. Please sign in again.');
    }
    throw new Error(errorText || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}