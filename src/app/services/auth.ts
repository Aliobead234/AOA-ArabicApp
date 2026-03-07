// Auth service - keeps all Supabase auth calls in one place
// Easy to swap out for another provider later (e.g. when migrating to Go + Railway)
import { supabase } from './supabase';
import type { AuthChangeEvent, User, Session } from '@supabase/supabase-js';

const REAUTH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
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
  const lastSignInAt = session.user.last_sign_in_at;
  if (lastSignInAt) {
    const parsed = Date.parse(lastSignInAt);
    if (!Number.isNaN(parsed)) return parsed;
  }

  const createdAt = session.user.created_at;
  if (createdAt) {
    const parsed = Date.parse(createdAt);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (session.expires_at && Number.isFinite(session.expires_in)) {
    const issuedAt = (session.expires_at - session.expires_in) * 1000;
    if (Number.isFinite(issuedAt) && issuedAt > 0) return issuedAt;
  }

  return null;
}

async function enforceReauthWindow(session: Session | null): Promise<Session | null> {
  if (!session) return null;

  const verificationTimestamp = getSessionVerificationTimestamp(session);
  if (verificationTimestamp === null) return session;

  if (Date.now() - verificationTimestamp <= REAUTH_WINDOW_MS) {
    return session;
  }

  try {
    await signOut();
  } catch (error) {
    console.warn('[Auth] Failed to sign out an expired session:', error);
  }

  return null;
}

function isOutsideReauthWindow(session: Session | null) {
  if (!session) return false;

  const verificationTimestamp = getSessionVerificationTimestamp(session);
  if (verificationTimestamp === null) return false;

  return Date.now() - verificationTimestamp > REAUTH_WINDOW_MS;
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
    if (isOutsideReauthWindow(session)) {
      window.setTimeout(() => {
        void signOut().catch((error) => {
          console.warn('[Auth] Failed to sign out an expired session:', error);
        });
      }, 0);
      callback(null, null, event);
      return;
    }

    callback(session, session?.user ?? null, event);
  });

  return data.subscription.unsubscribe;
}
