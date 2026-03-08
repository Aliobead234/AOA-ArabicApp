// Auth service - keeps all Supabase auth calls in one place
// Easy to swap out for another provider later (e.g. when migrating to Go + Railway)
import { supabase } from './supabase';
import type { AuthChangeEvent, User, Session } from '@supabase/supabase-js';

// Set a very long re-auth window to avoid premature sign-outs during debugging.
const REAUTH_WINDOW_MS = 3650 * 24 * 60 * 60 * 1000; // ~10 years
const AUTH_VERIFIED_AT_KEY = 'aoa_auth_verified_at';
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const CALLBACK_QUERY_PARAMS = [
  'code',
  'state',
  'error',
  'error_code',
  'error_description',
];
const INTERNAL_OAUTH_PATHS = new Set(['/oauth/consent']);

let refreshSessionPromise: Promise<Session | null> | null = null;

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export type AppAuthChangeEvent = AuthChangeEvent | 'SIGNED_OUT';

function getSessionVerificationTimestamp(session: Session): number | null {
  const savedTimestamp = readVerifiedAtTimestamp();
  if (savedTimestamp !== null) {
    return savedTimestamp;
  }

  const lastSignInAt = session.user.last_sign_in_at;
  if (lastSignInAt) {
    const parsed = Date.parse(lastSignInAt);
    if (!Number.isNaN(parsed)) {
      writeVerifiedAtTimestamp(parsed);
      return parsed;
    }
  }

  // If Supabase doesn't provide last_sign_in_at in this payload, treat the
  // current authenticated session as the verification point.
  const now = Date.now();
  writeVerifiedAtTimestamp(now);
  return now;
}

async function enforceReauthWindow(session: Session | null): Promise<Session | null> {
  if (!session) return null;

  const verificationTimestamp = getSessionVerificationTimestamp(session);
  if (verificationTimestamp === null) return session;

  if (Date.now() - verificationTimestamp > REAUTH_WINDOW_MS) {
    console.warn('[Auth] Reauth window exceeded, but keeping session to avoid forced logout');
  }
  return session;
}

function isOutsideReauthWindow(session: Session | null) {
  return false; // Disable forced sign-outs based on window while diagnosing logout loop
}

export function getCurrentRedirectPath() {
  const url = new URL(window.location.href);
  for (const param of CALLBACK_QUERY_PARAMS) {
    url.searchParams.delete(param);
  }

  const normalizedPath = normalizeAuthPath(url.pathname);
  return `${normalizedPath}${url.search}${url.hash}`;
}

export function isOAuthCallbackInProgress() {
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  return (
    searchParams.has('code') ||
    searchParams.has('error') ||
    hash.includes('access_token=') ||
    hash.includes('error=')
  );
}

export function clearOAuthCallbackParams() {
  const url = new URL(window.location.href);
  let changed = false;

  for (const param of CALLBACK_QUERY_PARAMS) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }

  if (url.hash.includes('access_token=') || url.hash.includes('error=')) {
    url.hash = '';
    changed = true;
  }

  if (changed) {
    const normalizedPath = normalizeAuthPath(url.pathname);
    window.history.replaceState(
      {},
      document.title,
      `${normalizedPath}${url.search}${url.hash}`
    );
  }
}

/** Sign in with Google OAuth via Supabase */
export async function signInWithGoogle(redirectTo?: string) {
  const redirectUrl = redirectTo || window.location.origin + '/';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) throw error;
  return data;
}

/** Sign out the current user */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  clearVerifiedAtTimestamp();
}

/** Get a valid access token from the current session */
export async function getAccessToken() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  if (!isSessionExpiring(session)) {
    return session.access_token;
  }

  const refreshed = await forceRefreshSession();
  return refreshed?.access_token ?? session.access_token ?? null;
}

/** Refresh access token and return the new token if available */
export async function refreshAccessToken() {
  const session = await forceRefreshSession();
  return session?.access_token ?? null;
}

/** Get the current session (for returning users) */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const session = await enforceReauthWindow(data.session);
  if (session) {
    return session;
  }

  // Recover from transient null-session windows during token rotation.
  return forceRefreshSession();
}

/** Get the current user */
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** Subscribe to auth state changes - returns an unsubscribe function */
export function onAuthStateChange(
  callback: (
    session: Session | null,
    user: User | null,
    event: AppAuthChangeEvent
  ) => void
) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    void (async () => {
      const eventName = event as AppAuthChangeEvent;

      if (eventName === 'SIGNED_OUT') {
        // Supabase can emit transient SIGNED_OUT during refresh edge-cases.
        // Re-check session once before forcing logout in UI.
        const { data: current } = await supabase.auth.getSession();
        const recoveredSession = current.session ?? (await forceRefreshSession());
        if (recoveredSession?.user) {
          callback(recoveredSession, recoveredSession.user, 'TOKEN_REFRESHED');
          return;
        }

        clearVerifiedAtTimestamp();
        callback(null, null, eventName);
        return;
      }

      if (eventName === 'SIGNED_IN') {
        writeVerifiedAtTimestamp(Date.now());
      }

      if (isOutsideReauthWindow(session)) {
        // keep session; do not force logout
      }

      callback(session, session?.user ?? null, eventName);
    })();
  });

  return data.subscription.unsubscribe;
}

function readVerifiedAtTimestamp(): number | null {
  if (typeof window === 'undefined') return null;

  const rawValue = window.localStorage.getItem(AUTH_VERIFIED_AT_KEY);
  if (!rawValue) return null;

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function writeVerifiedAtTimestamp(timestamp: number) {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return;

  window.localStorage.setItem(
    AUTH_VERIFIED_AT_KEY,
    String(Math.floor(timestamp))
  );
}

function clearVerifiedAtTimestamp() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_VERIFIED_AT_KEY);
}

async function ensureFreshSession(session: Session | null): Promise<Session | null> {
  const validSession = await enforceReauthWindow(session);
  if (!validSession) {
    return null;
  }

  if (!isSessionExpiring(validSession)) {
    return validSession;
  }

  const refreshedSession = await forceRefreshSession();
  return refreshedSession ?? null;
}

function isSessionExpiring(session: Session): boolean {
  const expiresAtMs = getSessionExpiryMs(session);
  if (expiresAtMs === null) {
    return false;
  }

  return expiresAtMs - Date.now() <= TOKEN_REFRESH_SKEW_MS;
}

function getSessionExpiryMs(session: Session): number | null {
  if (typeof session.expires_at === 'number' && Number.isFinite(session.expires_at)) {
    return session.expires_at * 1000;
  }

  return getJwtExpiryMs(session.access_token);
}

function getJwtExpiryMs(token: string | null | undefined): number | null {
  if (!token) {
    return null;
  }

  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(segments[1])) as { exp?: number };
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return null;
    }
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return atob(padded);
}

async function forceRefreshSession(): Promise<Session | null> {
  if (!refreshSessionPromise) {
    refreshSessionPromise = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('[Auth] Failed to refresh session:', error);
        return null;
      }

      return enforceReauthWindow(data.session);
    })().finally(() => {
      refreshSessionPromise = null;
    });
  }

  return refreshSessionPromise;
}

function normalizeAuthPath(pathname: string): string {
  const withSingleLeadingSlash = `/${pathname.replace(/^\/+/, '')}`;
  if (INTERNAL_OAUTH_PATHS.has(withSingleLeadingSlash)) {
    return '/';
  }
  return withSingleLeadingSlash || '/';
}
