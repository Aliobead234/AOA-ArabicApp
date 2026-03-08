// Singleton Supabase client — all Supabase interactions go through /services/
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;
const storageKey = `aoa-auth-session-${projectId}`;

if (typeof window !== 'undefined') {
  // Remove legacy key so old sessions from other Supabase projects do not
  // trigger "invalid auth token" loops in payment calls.
  window.localStorage.removeItem('aoa-auth-session');
}

export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey,
    flowType: 'pkce',
    debug: import.meta.env.DEV,
  },
  realtime: {
    // autoConnect removed - not a valid option in this version
  },
});
