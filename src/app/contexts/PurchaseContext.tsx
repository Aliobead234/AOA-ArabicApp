import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getCurrentSubscription } from '../services/paymentService';

interface Subscription {
  userId: string;
  planId: string;
  planName: string;
  status: string;
  orderId: string;
  activatedAt: string;
  expiresAt: string | null;
}

interface PurchaseContextValue {
  hasPurchased: boolean;
  subscription: Subscription | null;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const refreshSubscription = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      lastRefreshAtRef.current = 0;
      return;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    // Avoid bursts of duplicate subscription checks during rapid auth/UI updates.
    if (Date.now() - lastRefreshAtRef.current < 1000) {
      return Promise.resolve();
    }

    const run = (async () => {
      try {
        setLoading(true);
        const data = await getCurrentSubscription();
        setSubscription(data.subscription?.status === 'active' ? data.subscription : null);
      } catch (err) {
        console.error('Failed to fetch subscription:', err);
        setSubscription(null);
      } finally {
        lastRefreshAtRef.current = Date.now();
        setLoading(false);
      }
    })();

    refreshInFlightRef.current = run.finally(() => {
      refreshInFlightRef.current = null;
    });

    return refreshInFlightRef.current;
  }, [userId]);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  const hasPurchased = subscription?.status === 'active';

  return (
    <PurchaseContext.Provider value={{ hasPurchased, subscription, loading, refreshSubscription }}>
      {children}
    </PurchaseContext.Provider>
  );
}

export function usePurchase() {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error('usePurchase must be used within PurchaseProvider');
  return ctx;
}
