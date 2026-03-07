import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import * as authService from '../services/auth';
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
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      return;
    }

    const accessToken = await authService.getAccessToken();
    if (!accessToken) {
      setSubscription(null);
      return;
    }

    try {
      setLoading(true);
      const data = await getCurrentSubscription(accessToken);
      setSubscription(data.subscription?.status === 'active' ? data.subscription : null);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

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
