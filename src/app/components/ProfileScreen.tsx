import {
  Crown, BookOpen, Star, Target, TrendingUp,
  Bell, Palette, Globe, Moon, Volume2, Shield, FileText,
  ChevronRight, LogOut, Trash2, ExternalLink, Settings, ArrowLeft, LogIn
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { categories } from "../data/flashcardData";
import { useTheme } from "./ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { usePurchase } from "../contexts/PurchaseContext";

interface SettingItem {
  icon: React.ElementType;
  label: string;
  value?: string;
  danger?: boolean;
  action?: () => void;
}

export function ProfileScreen() {
  const [showSettings, setShowSettings] = useState(false);
  const topCategories = categories.slice(0, 4);
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const { hasPurchased, subscription } = usePurchase();
  const navigate = useNavigate();

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";
  const cardImgBg = isDark ? "bg-[#333]" : "bg-[#f0ebe3]";

  const generalSettings: SettingItem[] = [
    { icon: Bell, label: "Notifications", value: "On" },
    { icon: Palette, label: "Appearance", value: isDark ? "Dark" : "Light" },
    { icon: Globe, label: "Language", value: "English" },
    { icon: Volume2, label: "Sound effects", value: "On" },
  ];

  const accountSettings: SettingItem[] = [
    { icon: Shield, label: "Privacy" },
    { icon: FileText, label: "Terms and Conditions" },
    { icon: ExternalLink, label: "Rate the app" },
  ];

  const dangerSettings: SettingItem[] = [
    { icon: LogOut, label: "Sign out", action: signOut },
    { icon: Trash2, label: "Delete account", danger: true },
  ];

  const renderSettingGroup = (title: string, items: SettingItem[]) => (
    <div className="mb-5">
      <h4 className={`${colors.textDimmed} text-xs uppercase tracking-wider mb-2 px-1`}>{title}</h4>
      <div className={`${colors.card} rounded-2xl overflow-hidden divide-y ${isDark ? "divide-[#333]" : "divide-[#f0ebe3]"} ${!isDark ? "shadow-sm" : ""}`}>
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${colors.cardHover}`}
          >
            <div className="flex items-center gap-3">
              <item.icon size={18} className={item.danger ? "text-red-400" : colors.textMuted} />
              <span className={`text-sm ${item.danger ? "text-red-400" : colors.textSecondary}`}>
                {item.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {item.value && <span className={`${colors.textDimmed} text-sm`}>{item.value}</span>}
              <ChevronRight size={16} className={isDark ? "text-[#444]" : "text-[#ccc]"} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const displayName = user?.user_metadata?.name ?? user?.email ?? "Vocabulary app";
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col h-full px-5 pt-12 pb-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {showSettings ? (
          <button onClick={() => setShowSettings(false)} className={colors.textMuted}>
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button onClick={() => navigate(-1)} className={colors.textMuted}>
            <ArrowLeft size={22} />
          </button>
        )}
        <h2 className={`${colors.text} text-lg`}>{showSettings ? "Settings" : "Profile"}</h2>
        {!showSettings ? (
          <button onClick={() => setShowSettings(true)} className={colors.textMuted}>
            <Settings size={22} />
          </button>
        ) : (
          <div className="w-6" />
        )}
      </div>

      {showSettings ? (
        <>
          {/* Dark Mode Toggle */}
          <div className={`${colors.card} rounded-2xl p-4 flex items-center justify-between mb-5 ${!isDark ? "shadow-sm" : ""}`}>
            <div className="flex items-center gap-3">
              <Moon size={18} className={colors.textMuted} />
              <span className={`${colors.textSecondary} text-sm`}>Dark mode</span>
            </div>
            <button
              onClick={toggleTheme}
              className="w-12 h-7 rounded-full transition-colors flex items-center px-1"
              style={{ backgroundColor: isDark ? accentColor : "#d1d5db" }}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
                  isDark ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {renderSettingGroup("General", generalSettings)}
          {renderSettingGroup("Account", accountSettings)}
          {user && renderSettingGroup("Danger zone", dangerSettings)}

          <div className="text-center mt-2 mb-8">
            <p className={`${isDark ? "text-[#444]" : "text-[#ccc]"} text-xs`}>Version 1.0.0</p>
          </div>
        </>
      ) : (
        <>
          {/* Profile Card */}
          <div
            className={`rounded-3xl p-6 mb-6 border ${
              isDark
                ? "bg-gradient-to-br from-[#2a2418] to-[#1f1a14] border-[#3d3425]"
                : "bg-gradient-to-br from-[#fdf6e9] to-[#f5ead4] border-[#e8d9b8] shadow-md shadow-black/5"
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-[#c9a84c]/40"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#b8943f] flex items-center justify-center ring-2 ring-[#c9a84c]/30">
                  <span className="text-white text-xl font-medium">{avatarLetter}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className={`${isDark ? "text-[#f0e6d0]" : "text-[#2a2010]"} text-lg`}>{displayName}</h3>
                {user?.email && (
                  <p className={`${isDark ? "text-[#8a7d6b]" : "text-[#8a7a5a]"} text-sm truncate`}>{user.email}</p>
                )}
                {!user && (
                  <p className={`${isDark ? "text-[#8a7d6b]" : "text-[#8a7a5a]"} text-sm`}>Free plan</p>
                )}
              </div>
            </div>

            {!user ? (
              <button
                onClick={signInWithGoogle}
                className="w-full text-white py-3 rounded-xl flex items-center justify-center gap-2"
                style={{ backgroundColor: accentColor }}
              >
                <LogIn size={16} />
                <span className="text-sm">Sign in with Google</span>
              </button>
            ) : hasPurchased && subscription ? (
              <div className={`rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 ${
                isDark ? "bg-[#352d1a]" : "bg-[#f0e4c4]"
              }`}>
                <Crown size={16} className="text-[#c9a84c]" />
                <span className={`${isDark ? "text-[#e8d9a8]" : "text-[#6b5a2e]"} text-sm font-semibold`}>
                  {subscription.planName} Plan
                </span>
                {subscription.expiresAt ? (
                  <span className={`${isDark ? "text-[#8a7d6b]" : "text-[#8a7a5a]"} text-sm font-semibold ml-1`}>
                    · Renews {new Date(subscription.expiresAt).toLocaleDateString("ru-RU")}
                  </span>
                ) : (
                  <span className={`${isDark ? "text-[#8a7d6b]" : "text-[#8a7a5a]"} text-sm font-semibold ml-1`}>
                    · Lifetime
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={() => navigate("/payments")}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 bg-gradient-to-r from-[#c9a84c] to-[#b8943f] text-white"
              >
                <Crown size={16} />
                <span className="text-sm font-medium">Go Premium</span>
              </button>
            )}
          </div>

          {/* Stats */}
          <h3 className={`${colors.text} mb-3`}>Your stats</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className={`${colors.card} rounded-2xl p-4 flex items-center gap-3 ${!isDark ? "shadow-sm" : ""}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-[#1a3a2a]" : "bg-[#e6f5ee]"}`}>
                <BookOpen size={18} style={{ color: accentColor }} />
              </div>
              <div>
                <p className={colors.text}>142</p>
                <p className={`${colors.textDimmed} text-xs`}>Words learned</p>
              </div>
            </div>
            <div className={`${colors.card} rounded-2xl p-4 flex items-center gap-3 ${!isDark ? "shadow-sm" : ""}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-[#3a2a1a]" : "bg-[#fdf4e6]"}`}>
                <Star size={18} className="text-[#e8b84a]" />
              </div>
              <div>
                <p className={colors.text}>28</p>
                <p className={`${colors.textDimmed} text-xs`}>Favorites</p>
              </div>
            </div>
            <div className={`${colors.card} rounded-2xl p-4 flex items-center gap-3 ${!isDark ? "shadow-sm" : ""}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-[#2a1a3a]" : "bg-[#f3e8f9]"}`}>
                <Target size={18} className="text-[#a87ec8]" />
              </div>
              <div>
                <p className={colors.text}>87%</p>
                <p className={`${colors.textDimmed} text-xs`}>Quiz accuracy</p>
              </div>
            </div>
            <div className={`${colors.card} rounded-2xl p-4 flex items-center gap-3 ${!isDark ? "shadow-sm" : ""}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-[#1a2a3a]" : "bg-[#e6f0f8]"}`}>
                <TrendingUp size={18} className="text-[#7eb4c8]" />
              </div>
              <div>
                <p className={colors.text}>12</p>
                <p className={`${colors.textDimmed} text-xs`}>Day streak</p>
              </div>
            </div>
          </div>

          {/* Your Vocabulary */}
          <h3 className={`${colors.text} mb-3`}>Your vocabulary</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {topCategories.map((cat) => (
              <div key={cat.id} className={`${colors.card} rounded-2xl p-3 flex flex-col items-center ${!isDark ? "shadow-sm" : ""}`}>
                <div className={`w-full aspect-square rounded-xl overflow-hidden mb-2 ${cardImgBg}`}>
                  <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                </div>
                <span className={`${colors.text} text-sm`}>{cat.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}