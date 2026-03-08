import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "./ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { usePurchase } from "../contexts/PurchaseContext";
import {
  confirmSbpOrder,
  createSbpOrder,
  getSbpOrder,
} from "../services/paymentService";
import {
  ArrowLeft,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Building2,
  Phone,
  MessageSquare,
  Banknote,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface OrderData {
  orderId: string;
  amount: number;
  currency: string;
  planName: string;
  period: string;
  status: string;
  expiresAt: string;
  paymentComment: string;
  recipient: {
    phone: string;
    bankName: string;
    name: string;
  };
  qrPayload?: string;
  qrUrl?: string;
  qrImageUrl?: string;
  providerOrderId?: string;
  providerStatus?: string;
  token: string;
}

interface SBPPaymentScreenProps {
  planId: string;
  planName: string;
  onBack: () => void;
  onSuccess: () => void;
}

type PaymentStep =
  | "instructions"
  | "confirming"
  | "verifying"
  | "success"
  | "error";

export function SBPPaymentScreen({
  planId,
  planName,
  onBack,
  onSuccess,
}: SBPPaymentScreenProps) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { refreshSubscription } = usePurchase();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [step, setStep] = useState<PaymentStep>("instructions");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(
    null,
  );
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [pollCount, setPollCount] = useState(0);
  const createOrderRequestRef = useRef<Promise<void> | null>(null);
  const createOrderKeyRef = useRef<string | null>(null);
  const confirmInFlightRef = useRef(false);

  const accent = isDark ? "#7ec8a9" : "#5aab8b";

  // Create order on mount
  useEffect(() => {
    let cancelled = false;
    const requestKey = `${userId ?? "guest"}:${planId}`;

    async function createOrder() {
      if (!userId) {
        setError("Please sign in to continue");
        setLoading(false);
        return;
      }

      if (createOrderRequestRef.current && createOrderKeyRef.current === requestKey) {
        return createOrderRequestRef.current;
      }

      try {
        createOrderKeyRef.current = requestKey;
        setLoading(true);
        const run = (async () => {
          const data = await createSbpOrder(planId);
          if (cancelled) return;
          setOrder(data);
          setError(null);
        })();

        createOrderRequestRef.current = run.finally(() => {
          createOrderRequestRef.current = null;
        });

        await createOrderRequestRef.current;
      } catch (err: any) {
        if (cancelled) return;
        console.error("Failed to create order:", err);
        setError(err.message || "Failed to create order");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    createOrder();

    return () => {
      cancelled = true;
    };
  }, [planId, userId]);

  // Countdown timer
  useEffect(() => {
    if (!order?.expiresAt) return;
    const interval = setInterval(() => {
      const remaining =
        new Date(order.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft("Expired");
        setStep("error");
        setError(
          "Order has expired. Please go back and try again.",
        );
        clearInterval(interval);
      } else {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setTimeLeft(
          `${mins}:${secs.toString().padStart(2, "0")}`,
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [order?.expiresAt]);

  // Poll for order status after confirming
  useEffect(() => {
    if (step !== "verifying" || !order) return;
    const interval = setInterval(async () => {
      try {
        const data = await getSbpOrder(
          order.orderId,
        );
        if (data.status === "confirmed") {
          setStep("success");
          clearInterval(interval);
          await refreshSubscription();
        } else if (data.status === "rejected") {
          setStep("error");
          setError(
            "Payment was not verified. Please contact support.",
          );
          clearInterval(interval);
        } else if (data.status === "expired") {
          setStep("error");
          setError("Order expired during verification.");
          clearInterval(interval);
        }
        setPollCount((c) => c + 1);
      } catch (err) {
        console.error("Poll error:", err);
        const message =
          err instanceof Error ? err.message.toLowerCase() : "";
        if (
          message.includes("session expired") ||
          message.includes("invalid auth token")
        ) {
          setError("Session expired or invalid. Please sign in again.");
          setStep("error");
          clearInterval(interval);
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [step, order, refreshSubscription]);

  const handleCopy = useCallback(
    async (text: string, field: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      } catch {
        // Fallback for environments without clipboard API
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      }
    },
    [],
  );

  const handleConfirmPayment = async () => {
    if (!order || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    setStep("confirming");
    try {
      await confirmSbpOrder(
          order.orderId,
          order.token
      );
      setStep("verifying");
    } catch (err: any) {
      console.error("Confirm error:", err);
      setError(err.message || "Confirmation failed");
      setStep("error");
    } finally {
      confirmInFlightRef.current = false;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full ${colors.bg}`}
      >
        <Loader2
          size={32}
          className="animate-spin"
          style={{ color: accent }}
        />
        <p className={`${colors.textMuted} text-sm mt-4`}>
          Creating secure order...
        </p>
      </div>
    );
  }

  // Error creating order
  if (!order && error) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full px-8 ${colors.bg}`}
      >
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <p className={`${colors.text} text-center mb-2`}>
          Failed to create order
        </p>
        <p className="text-red-400 text-sm text-center mb-6">
          {error}
        </p>
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl text-white text-sm"
          style={{ backgroundColor: accent }}
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!order) return null;

  // Success state
  if (step === "success") {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full px-8 ${colors.bg}`}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ backgroundColor: `${accent}20` }}
          >
            <CheckCircle2 size={40} style={{ color: accent }} />
          </div>
        </motion.div>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <h2
            className={`${colors.text} text-xl font-semibold mb-2`}
          >
            Payment Verified!
          </h2>
          <p className={`${colors.textMuted} text-sm mb-1`}>
            Your <strong>{order.planName}</strong> plan is now
            active.
          </p>
          <p className={`${colors.textDimmed} text-xs mb-8`}>
            Order: {order.orderId}
          </p>
          <button
            onClick={onSuccess}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-medium"
            style={{ backgroundColor: accent }}
          >
            Start Learning
          </button>
        </motion.div>
      </div>
    );
  }

  // Verifying state
  if (step === "verifying") {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full px-8 ${colors.bg}`}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            repeat: Infinity,
            duration: 2,
            ease: "linear",
          }}
        >
          <ShieldCheck size={48} style={{ color: accent }} />
        </motion.div>
        <h2
          className={`${colors.text} text-lg font-semibold mt-6 mb-2`}
        >
          Verifying Payment
        </h2>
        <p
          className={`${colors.textMuted} text-sm text-center mb-1`}
        >
          We're checking your SBP transfer...
        </p>
        <p
          className={`${colors.textDimmed} text-xs text-center`}
        >
          This usually takes a few seconds
        </p>
        <div className="flex items-center gap-1.5 mt-6">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: accent }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                repeat: Infinity,
                duration: 1.2,
                delay: i * 0.3,
              }}
            />
          ))}
        </div>
        <p className={`${colors.textDimmed} text-[11px] mt-4`}>
          Order: {order.orderId}
        </p>
      </div>
    );
  }

  // Error after confirming
  if (step === "error") {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full px-8 ${colors.bg}`}
      >
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <p
          className={`${colors.text} text-center font-medium mb-2`}
        >
          Something went wrong
        </p>
        <p className="text-red-400 text-sm text-center mb-6">
          {error}
        </p>
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl text-white text-sm"
          style={{ backgroundColor: accent }}
        >
          Go Back
        </button>
      </div>
    );
  }

  // Main payment instructions
  return (
    <div className={`flex flex-col h-full ${colors.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <button onClick={onBack} className={colors.textMuted}>
          <ArrowLeft size={22} />
        </button>
        <div className="text-center">
          <h2
            className={`${colors.text} text-base font-medium`}
          >
            SBP Payment
          </h2>
          <p className={`text-[11px] ${colors.textDimmed}`}>
            Secure transfer
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={14} style={{ color: accent }} />
          <span
            className="text-xs font-mono"
            style={{ color: accent }}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {/* Order summary */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`${colors.card} rounded-2xl p-4 mb-4 ${!isDark ? "shadow-sm" : ""}`}
          style={isDark ? {} : { border: "1px solid #e8e3db" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className={`${colors.textMuted} text-xs`}>
              Plan
            </span>
            <span
              className={`${colors.text} text-sm font-medium`}
            >
              {order.planName}
            </span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className={`${colors.textMuted} text-xs`}>
              Amount
            </span>
            <span
              className={`${colors.text} text-2xl font-bold`}
            >
              {order.amount}{" "}
              <span className="text-sm font-normal">₽</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`${colors.textMuted} text-xs`}>
              Period
            </span>
            <span className={`${colors.textSecondary} text-xs`}>
              {order.period === "monthly"
                ? "Monthly subscription"
                : "One-time payment"}
            </span>
          </div>
        </motion.div>

        {/* Security badge */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
          style={{ backgroundColor: `${accent}15` }}
        >
          <ShieldCheck size={16} style={{ color: accent }} />
          <span
            className="text-[11px]"
            style={{ color: accent }}
          >
            Secured order #{order.orderId} — all transfers are
            tracked and verified
          </span>
        </motion.div>

        {order.qrImageUrl && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 }}
            className={`${colors.card} rounded-2xl p-4 mb-4 ${!isDark ? "shadow-sm" : ""}`}
            style={isDark ? {} : { border: "1px solid #e8e3db" }}
          >
            <h3 className={`${colors.text} text-sm font-medium mb-1`}>
              Pay via SBP QR
            </h3>
            <p className={`${colors.textMuted} text-xs mb-3`}>
              Scan this QR code in your banking app.
            </p>
            <div className="flex items-center justify-center rounded-xl p-3 mb-3 bg-white">
              <img
                src={order.qrImageUrl}
                alt="SBP QR code"
                className="w-52 h-52 object-contain"
              />
            </div>
            {order.qrUrl && (
              <a
                href={order.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
                style={{ color: accent }}
              >
                Open payment link
              </a>
            )}
          </motion.div>
        )}

        {/* Payment details */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <h3
            className={`${colors.text} text-sm font-medium mb-3`}
          >
            Transfer Details
          </h3>
          <p
            className={`${colors.textMuted} text-xs mb-4 leading-relaxed`}
          >
            Open your banking app, select{" "}
            <strong>SBP transfer by phone number</strong>, and
            enter the details below:
          </p>

          {/* Recipient phone */}
          <PaymentDetailRow
            icon={<Phone size={16} />}
            label="Phone Number"
            value={order.recipient.phone}
            displayValue={formatPhone(order.recipient.phone)}
            onCopy={handleCopy}
            copied={copiedField === "phone"}
            fieldId="phone"
            colors={colors}
            isDark={isDark}
            accent={accent}
          />

          {/* Bank */}
          <PaymentDetailRow
            icon={<Building2 size={16} />}
            label="Bank"
            value={order.recipient.bankName}
            displayValue={order.recipient.bankName}
            onCopy={handleCopy}
            copied={copiedField === "bank"}
            fieldId="bank"
            colors={colors}
            isDark={isDark}
            accent={accent}
          />

          {/* Amount */}
          <PaymentDetailRow
            icon={<Banknote size={16} />}
            label="Amount"
            value={`${order.amount}`}
            displayValue={`${order.amount} ₽`}
            onCopy={handleCopy}
            copied={copiedField === "amount"}
            fieldId="amount"
            colors={colors}
            isDark={isDark}
            accent={accent}
          />

          {/* Payment comment — CRITICAL */}
          <div
            className="rounded-2xl p-4 mb-4"
            style={{
              backgroundColor: isDark ? "#2a2218" : "#fff8ed",
              border: `1.5px solid ${isDark ? "#5a4a2a" : "#f0d890"}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare
                size={16}
                className="text-amber-400"
              />
              <span
                className={`text-xs font-semibold ${isDark ? "text-amber-300" : "text-amber-700"}`}
              >
                Payment Comment (REQUIRED)
              </span>
            </div>
            <p
              className={`text-[11px] mb-3 ${isDark ? "text-amber-200/70" : "text-amber-800/70"}`}
            >
              You <strong>must</strong> include this comment in
              your transfer so we can identify your payment:
            </p>
            <div className="flex items-center justify-between bg-black/10 rounded-xl px-4 py-3">
              <span
                className={`font-mono text-base font-bold ${isDark ? "text-amber-200" : "text-amber-900"}`}
              >
                {order.paymentComment}
              </span>
              <button
                onClick={() =>
                  handleCopy(order.paymentComment, "comment")
                }
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor:
                    copiedField === "comment"
                      ? accent
                      : isDark
                        ? "#444"
                        : "#e8e3db",
                  color:
                    copiedField === "comment"
                      ? "#fff"
                      : isDark
                        ? "#ddd"
                        : "#555",
                }}
              >
                {copiedField === "comment" ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}
                {copiedField === "comment" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Steps indicator */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className={`${colors.card} rounded-2xl p-4 mb-6 ${!isDark ? "shadow-sm" : ""}`}
          style={isDark ? {} : { border: "1px solid #e8e3db" }}
        >
          <h4
            className={`${colors.text} text-xs font-semibold mb-3`}
          >
            Steps:
          </h4>
          <div className="space-y-2.5">
            {[
              "Open your bank app (Tinkoff, Sber, etc.)",
              "Choose 'Transfer by phone' → SBP",
              `Enter phone: ${formatPhone(order.recipient.phone)}`,
              `Select bank: ${order.recipient.bankName}`,
              `Enter amount: ${order.amount} ₽`,
              `Add comment: ${order.paymentComment}`,
              "Send the transfer",
              'Come back here and tap "I\'ve Paid"',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                  style={{
                    backgroundColor: `${accent}20`,
                    color: accent,
                  }}
                >
                  {i + 1}
                </div>
                <span
                  className={`${colors.textSecondary} text-xs leading-relaxed`}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom action */}
      <div className="px-5 pb-6 pt-2">
        <button
          onClick={handleConfirmPayment}
          className="w-full py-4 rounded-2xl text-white text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{ backgroundColor: accent }}
        >
          <CheckCircle2 size={18} />
          I've Paid via SBP
        </button>
        <p
          className={`text-center text-[10px] ${colors.textDimmed} mt-3`}
        >
          Only confirm after completing the SBP transfer
        </p>
      </div>
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────

interface PaymentDetailRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  displayValue: string;
  onCopy: (text: string, field: string) => void;
  copied: boolean;
  fieldId: string;
  colors: any;
  isDark: boolean;
  accent: string;
}

function PaymentDetailRow({
  icon,
  label,
  value,
  displayValue,
  onCopy,
  copied,
  fieldId,
  colors,
  isDark,
  accent,
}: PaymentDetailRowProps) {
  return (
    <div
      className={`flex items-center justify-between ${colors.card} rounded-xl px-4 py-3 mb-2.5 ${!isDark ? "shadow-sm" : ""}`}
      style={isDark ? {} : { border: "1px solid #e8e3db" }}
    >
      <div className="flex items-center gap-3">
        <div className="opacity-50">{icon}</div>
        <div>
          <p className={`${colors.textDimmed} text-[10px]`}>
            {label}
          </p>
          <p className={`${colors.text} text-sm font-medium`}>
            {displayValue}
          </p>
        </div>
      </div>
      <button
        onClick={() => onCopy(value, fieldId)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
        style={{
          backgroundColor: copied
            ? accent
            : isDark
              ? "#333"
              : "#f0ebe3",
          color: copied ? "#fff" : isDark ? "#aaa" : "#777",
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function formatPhone(phone: string): string {
  // Format +79013622325 → +7 (901) 362-23-25
  if (!phone.startsWith("+7") || phone.length !== 12)
    return phone;
  const d = phone.slice(2);
  return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}
