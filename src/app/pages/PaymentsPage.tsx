import { useState } from "react";
import { useTheme } from "../components/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { usePurchase } from "../contexts/PurchaseContext";
import { SBPPaymentScreen } from "../components/SBPPaymentScreen";
import {
  CreditCard,
  Wallet,
  Bitcoin,
  Building2,
  Check,
  Crown,
  Star,
  Zap,
  Lock,
  LogIn,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router";

interface Plan {
  id: string;
  name: string;
  price: string;
  priceNote?: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  icon: typeof Star;
}

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "299 ₽",
    period: "one-time",
    description: "Try out the basics with a single deck.",
    features: [
      "1 flashcard deck (50 cards)",
      "Basic review mode",
      "Progress tracking",
      "Mobile-friendly",
    ],
    icon: Star,
  },
  {
    id: "pro",
    name: "Pro",
    price: "1 ₽",
    priceNote: "Testing price",
    period: "/month",
    description: "Full access for serious learners.",
    features: [
      "All flashcard decks",
      "Spaced repetition engine",
      "Audio pronunciation",
      "Offline access",
      "Priority support",
      "New decks monthly",
    ],
    popular: true,
    icon: Crown,
  },
  {
    id: "yearly",
    name: "Yearly",
    price: "2 399 ₽",
    priceNote: "Save 17% vs monthly",
    period: "/year",
    description: "Best value for committed learners.",
    features: [
      "Everything in Pro",
      "12 months of full access",
      "Priority support",
      "New decks & features included",
    ],
    icon: Zap,
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "2 999 ₽",
    period: "one-time",
    description: "Pay once, learn forever.",
    features: [
      "Everything in Pro",
      "Lifetime updates",
      "Exclusive community access",
      "Custom deck requests",
      "Early access to new features",
    ],
    icon: Zap,
  },
];

const paymentMethods = [
  { id: "sbp", name: "СБП (SBP)", icon: Building2, available: true },
  { id: "stripe", name: "Card (Stripe)", icon: CreditCard, available: false },
  { id: "paypal", name: "PayPal", icon: Wallet, available: false },
  { id: "crypto", name: "Crypto", icon: Bitcoin, available: false },
  { id: "mir", name: "MIR Card", icon: CreditCard, available: false },
];

export function PaymentsPage() {
  const { colors, isDark } = useTheme();
  const { user, signInWithGoogle } = useAuth();
  const { hasPurchased, subscription } = usePurchase();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [showSBPPayment, setShowSBPPayment] = useState(false);

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";

  // If user already has active subscription
  if (hasPurchased && subscription) {
    return (
      <div className={`flex flex-col h-full overflow-y-auto px-5 pt-12 pb-4 ${colors.bg}`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className={colors.textMuted}>
            <ArrowLeft size={22} />
          </button>
          <h2 className={`${colors.text} text-lg`}>Your Subscription</h2>
          <div className="w-6" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <CheckCircle2 size={32} style={{ color: accentColor }} />
          </div>
          <h3 className={`${colors.text} text-xl font-semibold mb-2`}>
            {subscription.planName} Plan Active
          </h3>
          <p className={`${colors.textMuted} text-sm text-center mb-1`}>
            Order: {subscription.orderId}
          </p>
          {subscription.expiresAt && (
            <p className={`${colors.textDimmed} text-xs text-center`}>
              Expires: {new Date(subscription.expiresAt).toLocaleDateString("ru-RU")}
            </p>
          )}
          <button
            onClick={() => navigate("/")}
            className="mt-8 px-8 py-3 rounded-2xl text-white text-sm font-medium"
            style={{ backgroundColor: accentColor }}
          >
            Continue Learning
          </button>
        </div>
      </div>
    );
  }

  // SBP Payment flow
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

  const handleProceed = () => {
    if (selectedMethod === "sbp" && selectedPlan) {
      setShowSBPPayment(true);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 pt-12 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className={colors.textMuted}>
          <ArrowLeft size={22} />
        </button>
        <h2 className={`${colors.text} text-lg`}>Choose Your Plan</h2>
        <div className="w-6" />
      </div>

      <p className={`${colors.textMuted} text-sm text-center mb-6`}>
        Unlock Arabic flashcard decks and start learning today. Pay securely via
        SBP (Система быстрых платежей).
      </p>

      {/* Plans */}
      <div className="space-y-3 mb-8">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          return (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative w-full text-left p-4 rounded-2xl border-2 transition-all ${
                isSelected
                  ? `${isDark ? "bg-[#1a3a2a]" : "bg-[#e6f5ee]"}`
                  : `${colors.card} ${!isDark ? "shadow-sm" : ""}`
              }`}
              style={{
                borderColor: isSelected ? accentColor : isDark ? "#333" : "#e8e3db",
              }}
            >
              {plan.popular && (
                <div
                  className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-white text-[10px] font-semibold"
                  style={{ backgroundColor: accentColor }}
                >
                  Most Popular
                </div>
              )}
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: isSelected
                      ? `${accentColor}30`
                      : isDark
                      ? "#333"
                      : "#f0ebe3",
                  }}
                >
                  <plan.icon
                    size={18}
                    style={{
                      color: isSelected ? accentColor : isDark ? "#999" : "#888",
                    }}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <h3 className={`${colors.text} text-base`}>{plan.name}</h3>
                    <div className="text-right">
                      <span className={`${colors.text} text-lg font-bold`}>
                        {plan.price}
                      </span>
                      <span className={`${colors.textDimmed} text-xs ml-1`}>
                        {plan.period}
                      </span>
                      {plan.priceNote && (
                        <span
                          className="block text-[10px] font-medium"
                          style={{ color: accentColor }}
                        >
                          {plan.priceNote}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`${colors.textMuted} text-xs mt-1 mb-2`}>
                    {plan.description}
                  </p>
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className={`flex items-center gap-1.5 text-xs ${colors.textSecondary}`}
                      >
                        <Check
                          size={12}
                          style={{ color: accentColor }}
                          className="flex-shrink-0"
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Payment Methods */}
      {selectedPlan && (
        <>
          <h3 className={`${colors.text} text-sm mb-3`}>Payment Method</h3>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {paymentMethods.map((pm) => (
              <button
                key={pm.id}
                onClick={() => pm.available && setSelectedMethod(pm.id)}
                disabled={!pm.available}
                className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                  selectedMethod === pm.id
                    ? `${isDark ? "bg-[#1a3a2a]" : "bg-[#e6f5ee]"}`
                    : pm.available
                    ? `${colors.card} ${colors.border}`
                    : `${isDark ? "bg-[#222]" : "bg-[#f5f0e8]"} opacity-50`
                }`}
                style={{
                  borderColor:
                    selectedMethod === pm.id
                      ? accentColor
                      : isDark
                      ? "#333"
                      : "#e8e3db",
                }}
              >
                <pm.icon size={16} className={colors.textMuted} />
                <div className="text-left">
                  <span className={`text-xs ${colors.text}`}>{pm.name}</span>
                  {!pm.available && (
                    <span className={`block text-[10px] ${colors.textDimmed}`}>
                      Coming soon
                    </span>
                  )}
                  {pm.id === "sbp" && pm.available && (
                    <span className="block text-[10px]" style={{ color: accentColor }}>
                      Available now
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* CTA */}
          {!user ? (
            <div
              className={`${colors.card} rounded-2xl p-5 text-center ${
                !isDark ? "shadow-sm" : ""
              }`}
            >
              <Lock size={20} className={colors.textMuted + " mx-auto mb-2"} />
              <p className={`${colors.textSecondary} text-sm mb-3`}>
                Sign in to complete your purchase
              </p>
              <button
                onClick={signInWithGoogle}
                className="w-full text-white py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
                style={{ backgroundColor: accentColor }}
              >
                <LogIn size={16} />
                Sign in with Google
              </button>
            </div>
          ) : (
            <button
              onClick={handleProceed}
              disabled={!selectedMethod}
              className="w-full py-3.5 rounded-2xl text-center text-white text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                backgroundColor: selectedMethod ? accentColor : isDark ? "#444" : "#ccc",
              }}
            >
              {selectedMethod === "sbp"
                ? `Pay ${plans.find((p) => p.id === selectedPlan)?.price} via SBP`
                : selectedMethod
                ? "Coming Soon"
                : "Select a payment method"}
            </button>
          )}
          <p
            className={`text-center text-[10px] ${colors.textDimmed} mt-3 mb-6`}
          >
            Payments processed via SBP (Система быстрых платежей) to Tinkoff
            Bank. Secure and instant.
          </p>
        </>
      )}
    </div>
  );
}
