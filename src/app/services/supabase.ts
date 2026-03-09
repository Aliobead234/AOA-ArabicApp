// Singleton Supabase client — all Supabase interactions go through /services/
import { createClient } from '@supabase/supabase-js';

const projectId    = 'xmhqgwrwezonofhvukpp';
const publicAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtaHFnd3J3ZXpvbm9maHZ1a3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDg1NDEsImV4cCI6MjA4ODI4NDU0MX0.r3AT-VgxMz-9x7km0N7gvlYPBv-eaI37--F8Ykd9Pgk';

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
