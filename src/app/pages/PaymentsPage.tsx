import { useState } from "react";
import { useTheme } from "../components/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { usePurchase } from "../contexts/PurchaseContext";
import { SBPPaymentScreen } from "../components/SBPPaymentScreen";
import {
  Crown, Check, ArrowLeft, Zap, Infinity, LogIn,
  BookOpen, Headphones, Brain, Sparkles, Building2,
  CheckCircle2, ChevronRight, CreditCard, Wallet, Bitcoin,
} from "lucide-react";
import { useNavigate } from "react-router";

interface PaymentMethod {
  id: string;
  name: string;
  sub: string;
  icon: React.ElementType;
  available: boolean;
  handler?: "sbp";
}

const paymentMethods: PaymentMethod[] = [
  {
    id: "sbp",
    name: "СБП",
    sub: "Система быстрых платежей",
    icon: Building2,
    available: true,
    handler: "sbp",
  },
  {
    id: "card",
    name: "Card",
    sub: "Visa / Mastercard — coming soon",
    icon: CreditCard,
    available: false,
  },
  {
    id: "paypal",
    name: "PayPal",
    sub: "Coming soon",
    icon: Wallet,
    available: false,
  },
  {
    id: "crypto",
    name: "Crypto",
    sub: "USDT / BTC — coming soon",
    icon: Bitcoin,
    available: false,
  },
];

interface Plan {
  id: string;
  name: string;
  price: string;
  priceRaw: number;
  period: string;
  badge?: string;
  badgeColor?: string;
  perMonth?: string;
  features: string[];
  icon: React.ElementType;
  gradient: string;
}

const plans: Plan[] = [
  {
    id: "pro",
    name: "Monthly",
    price: "1 ₽",
    priceRaw: 1,
    period: "/month",
    perMonth: "1 ₽/mo",
    features: [
      "All flashcard decks",
      "Spaced repetition engine",
      "Audio pronunciation",
      "Offline access",
    ],
    icon: Zap,
    gradient: "linear-gradient(135deg, #7ec8a9 0%, #5aab8b 100%)",
  },
  {
    id: "yearly",
    name: "Annual",
    price: "2 399 ₽",
    priceRaw: 2399,
    period: "/year",
    badge: "Save 17%",
    badgeColor: "#c9a84c",
    perMonth: "200 ₽/mo",
    features: [
      "Everything in Monthly",
      "12 months full access",
      "Priority support",
      "New decks & features",
    ],
    icon: Crown,
    gradient: "linear-gradient(135deg, #c9a84c 0%, #b8943f 100%)",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "2 999 ₽",
    priceRaw: 2999,
    period: "one-time",
    badge: "Best deal",
    badgeColor: "#a87ec8",
    features: [
      "Everything in Annual",
      "Pay once, learn forever",
      "Exclusive community access",
      "Early access to new features",
    ],
    icon: Infinity,
    gradient: "linear-gradient(135deg, #a87ec8 0%, #8a5cb0 100%)",
  },
];

const highlights = [
  { icon: BookOpen, label: "500+ flashcards", sub: "Across all topics" },
  { icon: Brain, label: "Spaced repetition", sub: "Science-backed learning" },
  { icon: Headphones, label: "Audio pronunciation", sub: "Native speaker audio" },
  { icon: Sparkles, label: "New content", sub: "Added every month" },
];

export function PaymentsPage() {
  const { colors, isDark } = useTheme();
  const { user, signInWithGoogle } = useAuth();
  const { hasPurchased, subscription } = usePurchase();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string>("yearly");
  const [selectedMethod, setSelectedMethod] = useState<string>("sbp");
  const [showSBPPayment, setShowSBPPayment] = useState(false);

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";

  // Already subscribed
  if (hasPurchased && subscription) {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-5 pt-12 pb-8">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className={colors.textMuted}>
            <ArrowLeft size={22} />
          </button>
          <h2 className={`${colors.text} text-lg`}>Subscription</h2>
          <div className="w-6" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ background: "linear-gradient(135deg, #c9a84c 0%, #b8943f 100%)" }}
          >
            <Crown size={34} className="text-white" />
          </div>
          <h3 className={`${colors.text} text-xl font-semibold mb-1`}>
            {subscription.planName} Plan
          </h3>
          <p className={`${colors.textMuted} text-sm mb-1`}>Active subscription</p>
          {subscription.expiresAt ? (
            <p className={`${colors.textDimmed} text-xs mb-8`}>
              Renews {new Date(subscription.expiresAt).toLocaleDateString("ru-RU")}
            </p>
          ) : (
            <p className={`${colors.textDimmed} text-xs mb-8`}>Lifetime access</p>
          )}

          {/* Active features */}
          <div className={`w-full rounded-2xl p-4 mb-6 ${isDark ? "bg-[#1e1e1e]" : "bg-[#f5f5f5]"}`}>
            {highlights.map((h) => (
              <div key={h.label} className="flex items-center gap-3 py-2">
                <CheckCircle2 size={16} style={{ color: accentColor }} className="flex-shrink-0" />
                <span className={`${colors.textSecondary} text-sm`}>{h.label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate("/")}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-medium"
            style={{ backgroundColor: accentColor }}
          >
            Continue Learning
          </button>
        </div>
      </div>
    );
  }

  // SBP payment flow
  if (showSBPPayment && selectedPlan) {
    const plan = plans.find((p) => p.id === selectedPlan);
    return (
      <SBPPaymentScreen
        planId={selectedPlan}
        planName={plan?.name || selectedPlan}
        onBack={() => setShowSBPPayment(false)}
        onSuccess={() => {
          setShowSBPPayment(false);
          navigate("/");
        }}
      />
    );
  }

  const selected = plans.find((p) => p.id === selectedPlan)!;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-8">
      {/* Hero */}
      <div
        className="relative px-5 pt-12 pb-8"
        style={{
          background: isDark
            ? "linear-gradient(160deg, #1e1a12 0%, #1a1a1a 60%)"
            : "linear-gradient(160deg, #fdf6e3 0%, #fafaf7 60%)",
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className={`${colors.textMuted} mb-6 flex items-center gap-1`}
        >
          <ArrowLeft size={20} />
        </button>

        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "linear-gradient(135deg, #c9a84c 0%, #b8943f 100%)", boxShadow: "0 8px 24px rgba(201,168,76,0.35)" }}
        >
          <Crown size={26} className="text-white" />
        </div>

        <h1 className={`${isDark ? "text-[#f0e6d0]" : "text-[#1a1a1a]"} text-2xl font-bold mb-1`}>
          Go Premium
        </h1>
        <p className={`${isDark ? "text-[#8a7d6b]" : "text-[#8a7a5a]"} text-sm max-w-[280px]`}>
          Unlock everything and master Arabic at your own pace.
        </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 gap-2.5 mt-6">
          {highlights.map((h) => (
            <div
              key={h.label}
              className={`rounded-xl p-3 flex items-center gap-2.5 ${
                isDark ? "bg-[#252218]" : "bg-white/80"
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${accentColor}20` }}
              >
                <h.icon size={15} style={{ color: accentColor }} />
              </div>
              <div>
                <p className={`${isDark ? "text-[#e8d9a8]" : "text-[#2a2010]"} text-xs font-medium`}>{h.label}</p>
                <p className={`${isDark ? "text-[#6b5f4e]" : "text-[#9a8a6a]"} text-[10px]`}>{h.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pt-6">
        {/* Plan selector */}
        <h2 className={`${colors.text} text-base font-semibold mb-3`}>Choose your plan</h2>
        <div className="space-y-3 mb-6">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className="relative w-full text-left rounded-2xl transition-all active:scale-[0.99]"
                style={{
                  border: `2px solid ${isSelected ? (plan.badgeColor ?? accentColor) : isDark ? "#2a2a2a" : "#e8e3db"}`,
                  background: isSelected
                    ? isDark ? "#1e1a12" : "#fffdf5"
                    : isDark ? "#1a1a1a" : "#fafafa",
                }}
              >
                {plan.badge && (
                  <div
                    className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-white text-[10px] font-semibold"
                    style={{ backgroundColor: plan.badgeColor }}
                  >
                    {plan.badge}
                  </div>
                )}
                <div className="p-4 flex items-center gap-3">
                  {/* Icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isSelected ? plan.gradient : isDark ? "#252525" : "#f0ebe3",
                    }}
                  >
                    <plan.icon size={19} className={isSelected ? "text-white" : ""} style={!isSelected ? { color: isDark ? "#666" : "#999" } : {}} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <span className={`${colors.text} text-sm font-semibold`}>{plan.name}</span>
                      <div className="text-right">
                        <span className={`${colors.text} text-lg font-bold`}>{plan.price}</span>
                        <span className={`${colors.textDimmed} text-xs ml-1`}>{plan.period}</span>
                      </div>
                    </div>
                    {plan.perMonth && (
                      <p className="text-[11px] mt-0.5" style={{ color: isSelected ? (plan.badgeColor ?? accentColor) : isDark ? "#555" : "#aaa" }}>
                        {plan.perMonth}
                      </p>
                    )}
                  </div>

                  {/* Check */}
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor: isSelected ? (plan.badgeColor ?? accentColor) : isDark ? "#333" : "#ddd",
                      backgroundColor: isSelected ? (plan.badgeColor ?? accentColor) : "transparent",
                    }}
                  >
                    {isSelected && <Check size={11} className="text-white" />}
                  </div>
                </div>

                {/* Features — only when selected */}
                {isSelected && (
                  <div
                    className="mx-4 mb-4 rounded-xl p-3 space-y-1.5"
                    style={{ backgroundColor: isDark ? "#141414" : "#f5f0e8" }}
                  >
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <Check size={11} style={{ color: plan.badgeColor ?? accentColor }} className="flex-shrink-0" />
                        <span className={`${colors.textSecondary} text-xs`}>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Payment method */}
        <h2 className={`${colors.text} text-base font-semibold mb-3`}>Payment method</h2>
        <div
          className={`rounded-2xl overflow-hidden mb-6 border ${
            isDark ? "border-[#2a2a2a]" : "border-[#e8e3db]"
          }`}
        >
          {paymentMethods.map((pm, i) => {
            const isSelected = selectedMethod === pm.id;
            const isLast = i === paymentMethods.length - 1;
            return (
              <button
                key={pm.id}
                onClick={() => pm.available && setSelectedMethod(pm.id)}
                disabled={!pm.available}
                className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${
                  !isLast ? `border-b ${isDark ? "border-[#2a2a2a]" : "border-[#e8e3db]"}` : ""
                } ${
                  isSelected
                    ? isDark ? "bg-[#1e1a12]" : "bg-[#fffdf5]"
                    : pm.available
                    ? isDark ? "bg-[#1a1a1a] hover:bg-[#1e1e1e]" : "bg-white hover:bg-[#fafafa]"
                    : isDark ? "bg-[#161616]" : "bg-[#f9f9f9]"
                }`}
              >
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isSelected
                      ? selected.gradient
                      : isDark ? "#252525" : "#f0ebe3",
                  }}
                >
                  <pm.icon
                    size={16}
                    className={isSelected ? "text-white" : ""}
                    style={!isSelected ? { color: isDark ? "#555" : "#aaa" } : {}}
                  />
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${pm.available ? colors.text : colors.textDimmed}`}>
                    {pm.name}
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-[#4a4a4a]" : "text-[#bbb]"}`}>
                    {pm.sub}
                  </p>
                </div>

                {/* State indicator */}
                {pm.available ? (
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor: isSelected ? (selected.badgeColor ?? accentColor) : isDark ? "#333" : "#ddd",
                      backgroundColor: isSelected ? (selected.badgeColor ?? accentColor) : "transparent",
                    }}
                  >
                    {isSelected && <Check size={11} className="text-white" />}
                  </div>
                ) : (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      color: isDark ? "#555" : "#bbb",
                      background: isDark ? "#252525" : "#f0ebe3",
                    }}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* CTA */}
        {!user ? (
          <div
            className={`rounded-2xl p-5 text-center mb-4 ${
              isDark ? "bg-[#1e1e1e] border border-[#2a2a2a]" : "bg-[#f5f5f5] border border-[#eaeaea]"
            }`}
          >
            <p className={`${colors.textSecondary} text-sm mb-3`}>
              Sign in to complete your purchase
            </p>
            <button
              onClick={signInWithGoogle}
              className="w-full text-white py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium active:scale-[0.98] transition-transform"
              style={{ backgroundColor: accentColor }}
            >
              <LogIn size={16} />
              Continue with Google
            </button>
          </div>
        ) : (
          <button
            onClick={() => { if (selectedMethod === "sbp") setShowSBPPayment(true); }}
            disabled={paymentMethods.find(m => m.id === selectedMethod)?.available !== true}
            className="w-full py-4 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mb-4 disabled:opacity-50"
            style={{
              background: selected.gradient,
              boxShadow: `0 6px 20px ${selected.badgeColor ? selected.badgeColor + "40" : accentColor + "40"}`,
            }}
          >
            <Building2 size={16} />
            Pay {selected.price}
            <ChevronRight size={16} />
          </button>
        )}

        <p className={`text-center text-[11px] ${colors.textDimmed} mb-2`}>
          Payments processed securely · ИП Обейд Е.Г. · ИНН 500315107978
        </p>
      </div>
    </div>
  );
}
