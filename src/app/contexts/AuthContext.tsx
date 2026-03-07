import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import * as authService from '../services/auth';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  guestMode: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestMode, setGuestMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    const oauthCallbackInProgress = authService.isOAuthCallbackInProgress();
    if (oauthCallbackInProgress) {
      console.log('[Auth] OAuth callback detected, waiting for session exchange...');
    }

    const unsubscribe = authService.onAuthStateChange((sess, usr, event) => {
      console.log('[Auth] onAuthStateChange:', {
        event,
        hasSession: !!sess,
        hasUser: !!usr,
      });

      if (!mounted) return;

      setSession(sess);
      setUser(usr);
      if (usr) {
        setGuestMode(false);
        localStorage.removeItem('aoa_guest_mode');
      }
      setLoading(false);
    });

    const oauthTimeout = oauthCallbackInProgress
      ? window.setTimeout(() => {
          if (!mounted) return;
          setLoading(false);
        }, 8000)
      : null;

    authService
      .getSession()
      .then((sess) => {
        if (!mounted) return;

        console.log('[Auth] Initial getSession result:', { hasSession: !!sess });
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) {
          setGuestMode(false);
          localStorage.removeItem('aoa_guest_mode');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('[Auth] Error getting session:', err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      if (oauthTimeout) window.clearTimeout(oauthTimeout);
      unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    localStorage.removeItem('aoa_guest_mode');
    setGuestMode(false);

    // Keep the user on the current route after OAuth, without callback params.
    const currentPath = authService.getCurrentRedirectPath();
    await authService.signInWithGoogle(window.location.origin + currentPath);
  };

  const handleSignOut = async () => {
    localStorage.removeItem('aoa_guest_mode');
    await authService.signOut();
    setUser(null);
    setSession(null);
    setGuestMode(false);
  };

  const continueAsGuest = useCallback(() => {
    localStorage.setItem('aoa_guest_mode', 'true');
    setGuestMode(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (localStorage.getItem('aoa_guest_mode') === 'true') {
      setGuestMode(true);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        guestMode,
        signInWithGoogle: handleSignIn,
        signOut: handleSignOut,
        continueAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}