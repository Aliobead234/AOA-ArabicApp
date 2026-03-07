// Auth service - keeps all Supabase auth calls in one place
// Easy to swap out for another provider later (e.g. when migrating to Go + Railway)
import { supabase } from './supabase';
import type { AuthChangeEvent, User, Session } from '@supabase/supabase-js';

// Set a very long re-auth window to avoid premature sign-outs during debugging.
const REAUTH_WINDOW_MS = 3650 * 24 * 60 * 60 * 1000; // ~10 years
const AUTH_VERIFIED_AT_KEY = 'aoa_auth_verified_at';
const CALLBACK_QUERY_PARAMS = [
  'code',
  'state',
  'error',
  'error_code',
  'error_description',
];

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

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

  return `${url.pathname}${url.search}${url.hash}`;
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
    window.history.replaceState(
      {},
      document.title,
      `${url.pathname}${url.search}${url.hash}`
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
  return session?.access_token ?? null;
}

/** Refresh access token and return the new token if available */
export async function refreshAccessToken() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    return null;
  }

  const validSession = await enforceReauthWindow(data.session);
  return validSession?.access_token ?? null;
}

/** Get the current session (for returning users) */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  return enforceReauthWindow(data.session);
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
    event: AuthChangeEvent
  ) => void
) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearVerifiedAtTimestamp();
      callback(null, null, event);
      return;
    }

    if (event === 'SIGNED_IN') {
      writeVerifiedAtTimestamp(Date.now());
    }

    if (isOutsideReauthWindow(session)) {
      // keep session; do not force logout
    }

    callback(session, session?.user ?? null, event);
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
