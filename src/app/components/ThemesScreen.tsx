import { ArrowLeft, Check } from "lucide-react";
import { useNavigate } from "react-router";
import { useTheme, appThemes, type AppTheme } from "./ThemeContext";

export function ThemesScreen() {
  const { colors, isDark, appTheme, setAppTheme, themeConfig } = useTheme();
  const navigate = useNavigate();

  const accentColor = isDark ? themeConfig.accent : "#5aab8b";

  return (
    <div className="flex flex-col h-full px-5 pt-12 pb-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className={colors.textMuted}>
          <ArrowLeft size={22} />
        </button>
        <h2 className={`${colors.text} text-lg`}>Themes</h2>
        <div className="w-6" />
      </div>

      <p className={`text-sm mb-6`} style={{ color: isDark ? themeConfig.textMuted : "#888" }}>
        Each theme changes the app's colors, background, and feel. Card style switches to transparent automatically.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {appThemes.map((t) => {
          const isActive = appTheme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setAppTheme(t.id as AppTheme)}
              className="relative rounded-2xl overflow-hidden text-left transition-all active:scale-[0.97]"
              style={{
                border: `2px solid ${isActive ? accentColor : isDark ? themeConfig.border : "#e8e3db"}`,
              }}
            >
              {/* Preview swatch */}
              <div
                className="relative h-28 flex flex-col justify-between p-3"
                style={{ background: t.bg }}
              >
                {/* Active check */}
                {isActive && (
                  <div
                    className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Check size={11} className="text-white" />
                  </div>
                )}

                {/* Fake card strip */}
                <div
                  className="w-full rounded-lg px-3 py-2 flex flex-col gap-1.5"
                  style={{ background: `${t.surface}cc`, border: `1px solid ${t.border}` }}
                >
                  {/* Neon tag preview */}
                  <div
                    className="w-10 h-3 rounded-full"
                    style={{
                      background: `${t.accent}18`,
                      border: `1px solid ${t.accent}30`,
                      boxShadow: `0 0 6px ${t.accent}15`,
                    }}
                  />
                  <div className="w-16 h-3 rounded-sm" style={{ background: `${t.text}40` }} />
                </div>

                {/* Accent dots */}
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: t.accent }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: t.surfaceAlt }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: t.border }} />
                </div>
              </div>

              {/* Label */}
              <div
                className="px-3 py-2.5"
                style={{
                  background: isActive
                    ? isDark ? t.surfaceAlt : "#f5f5f5"
                    : isDark ? themeConfig.surface : "#fafafa",
                }}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: isActive ? accentColor : isDark ? themeConfig.textSecondary : "#333" }}
                >
                  {t.name}
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: isDark ? themeConfig.textDimmed : "#aaa" }}
                >
                  {t.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Note */}
      {appTheme !== "default" && (
        <div
          className="mt-5 rounded-2xl px-4 py-3 flex items-start gap-2.5"
          style={{
            background: isDark ? themeConfig.surface : "#f5f5f5",
            border: `1px solid ${isDark ? themeConfig.border : "#e8e3db"}`,
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
            style={{ background: accentColor }}
          />
          <p className="text-xs" style={{ color: isDark ? themeConfig.textMuted : "#888" }}>
            Card style is locked to <span style={{ color: accentColor }}>Default</span> while a theme is active — this keeps the look clean and consistent.
          </p>
        </div>
      )}
    </div>
  );
}
