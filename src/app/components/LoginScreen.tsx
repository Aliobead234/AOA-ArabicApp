import { LogIn, ExternalLink } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { motion } from "motion/react";

// Detect Telegram WebView environment.
// Google OAuth is blocked by Google's policy inside Telegram's WebView.
function isTelegramWebView(): boolean {
  if (typeof window === "undefined") return false;
  // Telegram injects window.Telegram.WebApp
  if ((window as any).Telegram?.WebApp?.initData !== undefined) return true;
  // Fallback: user-agent check
  return /Telegram/i.test(navigator.userAgent);
}

function openInExternalBrowser() {
  const url = window.location.href;
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

export function LoginScreen() {
  const { signInWithGoogle, loading, continueAsGuest } = useAuth();
  const inTelegram = isTelegramWebView();

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] w-full relative">
      {/* Top area with logo */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#7ec8a9] to-[#5aab8b] flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="text-white text-3xl font-bold">A</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center"
        >
          <h1 className="text-[#f5f0e8] text-[28px] font-semibold mb-3">
            Keep your data safe
          </h1>
          <p className="text-[#999] text-[15px] leading-relaxed max-w-[280px] mx-auto">
            Create an account so you never lose favorites,
            collections, and settings when you reinstall or switch
            devices
          </p>
        </motion.div>
      </div>

      {/* Sign-in buttons */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="px-8 pb-12 w-full max-w-md mx-auto"
      >
        {inTelegram ? (
          /* ── Telegram WebView: Google OAuth is blocked by Google policy ── */
          <>
            <div className="w-full rounded-2xl mb-4 px-4 py-4 text-center"
              style={{ backgroundColor: "rgba(126,200,169,0.12)", border: "1px solid rgba(126,200,169,0.3)" }}
            >
              <p className="text-[#7ec8a9] text-sm font-medium mb-1">
                Google Sign-in unavailable in Telegram
              </p>
              <p className="text-[#666] text-[12px] leading-relaxed">
                Google blocks sign-in inside Telegram's browser.
                Open the app in your phone's browser to sign in with Google.
              </p>
            </div>

            <button
              onClick={openInExternalBrowser}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl mb-3 transition-all active:scale-[0.98]"
              style={{ backgroundColor: "#7ec8a9" }}
            >
              <ExternalLink size={18} className="text-white" />
              <span className="text-white text-[15px] font-semibold">
                Open in Browser to Sign In
              </span>
            </button>
          </>
        ) : (
          /* ── Normal browser: Google OAuth ── */
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-[#1a1a1a] py-4 rounded-2xl mb-3 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span className="text-[15px] font-semibold">
              Sign in with Google
            </span>
          </button>
        )}

        <p className="text-center text-[12px] text-[#666] mt-6">
          By signing in, you agree to our{" "}
          <span className="underline text-[#7ec8a9]">
            Terms & Conditions
          </span>{" "}
          and{" "}
          <span className="underline text-[#7ec8a9]">
            Privacy Policy
          </span>
        </p>

        <button
          onClick={continueAsGuest}
          className="mt-4 w-full text-center text-[13px] text-[#888] hover:text-[#7ec8a9] transition-colors py-2"
        >
          Continue without signing in →
        </button>
      </motion.div>
    </div>
  );
}
