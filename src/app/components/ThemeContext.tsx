import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
export type CardVariant = "classic" | "notion" | "default";
export type AppTheme = "default" | "ocean" | "midnight" | "forest" | "ember" | "rose";

export interface AppThemeConfig {
  id: AppTheme;
  name: string;
  description: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textDimmed: string;
  bgImage?: string;   // path to bg image in /themes/
  font?: string;       // font-family override
}

export const appThemes: AppThemeConfig[] = [
  {
    id: "default",
    name: "Default",
    description: "Warm dark, green accent",
    bg: "#1a1a1a",
    surface: "#222222",
    surfaceAlt: "#2a2a2a",
    accent: "#7ec8a9",
    border: "#2a2a2a",
    text: "#f5f0e8",
    textSecondary: "#cccccc",
    textMuted: "#999999",
    textDimmed: "#666666",
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep navy, sky blue accent",
    bg: "#0c1a2e",
    surface: "#102240",
    surfaceAlt: "#162c50",
    accent: "#38bdf8",
    border: "#162c50",
    text: "#e0f2fe",
    textSecondary: "#90cae8",
    textMuted: "#3d6e8a",
    textDimmed: "#1e3d52",
    // bgImage: "/themes/ocean.jpg",
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep purple, violet accent",
    bg: "#0e0b1e",
    surface: "#150f2a",
    surfaceAlt: "#1c1436",
    accent: "#a78bfa",
    border: "#1c1436",
    text: "#ede9fe",
    textSecondary: "#b8a8f0",
    textMuted: "#5040a0",
    textDimmed: "#2a1e6a",
    // bgImage: "/themes/midnight.jpg",
  },
  {
    id: "forest",
    name: "Forest",
    description: "Dark green, emerald accent",
    bg: "#0a1a0e",
    surface: "#0f2214",
    surfaceAlt: "#142c1a",
    accent: "#4ade80",
    border: "#142c1a",
    text: "#dcfce7",
    textSecondary: "#86c89a",
    textMuted: "#2a6040",
    textDimmed: "#143020",
    // bgImage: "/themes/forest.jpg",
  },
  {
    id: "ember",
    name: "Ember",
    description: "Near-black warm, amber accent",
    bg: "#140e08",
    surface: "#1e1508",
    surfaceAlt: "#281c0c",
    accent: "#fb923c",
    border: "#281c0c",
    text: "#fef3e2",
    textSecondary: "#e8c090",
    textMuted: "#7a4a20",
    textDimmed: "#3a2410",
    // bgImage: "/themes/ember.jpg",
  },
  {
    id: "rose",
    name: "Rose",
    description: "Dark mauve, pink accent",
    bg: "#180d14",
    surface: "#22101c",
    surfaceAlt: "#2c1426",
    accent: "#f472b6",
    border: "#2c1426",
    text: "#fce7f3",
    textSecondary: "#e0a0c0",
    textMuted: "#7a3060",
    textDimmed: "#3a1030",
    // bgImage: "/themes/rose.jpg",
  },
];

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
  cardVariant: CardVariant;
  setCardVariant: (v: CardVariant) => void;
  appTheme: AppTheme;
  setAppTheme: (t: AppTheme) => void;
  themeConfig: AppThemeConfig;
  colors: {
    bg: string;
    card: string;
    cardHover: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textDimmed: string;
    accent: string;
    accentBg: string;
    creamCard: string;
    creamCardInner: string;
    creamCardText: string;
    creamCardSubtext: string;
    navInactive: string;
  };
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  const [appTheme, setAppThemeState] = useState<AppTheme>(() =>
    (localStorage.getItem("aoa-app-theme") as AppTheme) ?? "default"
  );

  const [cardVariant, setCardVariantState] = useState<CardVariant>(() =>
    (localStorage.getItem("aoa-card-variant") as CardVariant) ?? "notion"
  );

  const isDark = theme === "dark";
  const themeConfig = appThemes.find((t) => t.id === appTheme) ?? appThemes[0];

  // Apply theme via CSS custom properties so Tailwind classes resolve correctly
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.style.setProperty("--t-bg", themeConfig.bg);
      root.style.setProperty("--t-surface", themeConfig.surface);
      root.style.setProperty("--t-surface-alt", themeConfig.surfaceAlt);
      root.style.setProperty("--t-accent", themeConfig.accent);
      root.style.setProperty("--t-border", themeConfig.border);
      root.style.setProperty("--t-text", themeConfig.text);
      root.style.setProperty("--t-text-secondary", themeConfig.textSecondary);
      root.style.setProperty("--t-text-muted", themeConfig.textMuted);
      root.style.setProperty("--t-text-dimmed", themeConfig.textDimmed);
      root.style.backgroundColor = themeConfig.bg;

      // Background image (if theme has one)
      if (themeConfig.bgImage) {
        root.style.setProperty("--t-bg-image", `url(${themeConfig.bgImage})`);
      } else {
        root.style.removeProperty("--t-bg-image");
      }

      // Font override
      if (themeConfig.font) {
        root.style.setProperty("--t-font", themeConfig.font);
      } else {
        root.style.removeProperty("--t-font");
      }
    } else {
      root.style.backgroundColor = "#faf7f2";
      root.style.removeProperty("--t-bg-image");
      root.style.removeProperty("--t-font");
    }
  }, [isDark, themeConfig]);

  const setAppTheme = (t: AppTheme) => {
    setAppThemeState(t);
    localStorage.setItem("aoa-app-theme", t);
    if (t !== "default") {
      setCardVariantState("default");
      localStorage.setItem("aoa-card-variant", "default");
    }
  };

  const setCardVariant = (v: CardVariant) => {
    if (appTheme !== "default" && v !== "default") return;
    setCardVariantState(v);
    localStorage.setItem("aoa-card-variant", v);
  };

  // Colors: dark mode reads CSS custom properties, light mode stays warm/static
  const colors = isDark
    ? {
        bg:               "bg-[var(--t-bg)]",
        card:             "bg-[var(--t-surface)]",
        cardHover:        "active:bg-[var(--t-surface-alt)]",
        border:           "border-[var(--t-border)]",
        text:             "text-[var(--t-text)]",
        textSecondary:    "text-[var(--t-text-secondary)]",
        textMuted:        "text-[var(--t-text-muted)]",
        textDimmed:       "text-[var(--t-text-dimmed)]",
        accent:           "text-[var(--t-accent)]",
        accentBg:         "bg-[var(--t-accent)]",
        creamCard:        "bg-[#f5f0e8]",
        creamCardInner:   "bg-[#e8e3db]",
        creamCardText:    "text-[#1a1a1a]",
        creamCardSubtext: "text-[#666]",
        navInactive:      "text-[var(--t-text-dimmed)]",
      }
    : {
        bg:               "bg-[#faf7f2]",
        card:             "bg-white",
        cardHover:        "active:bg-[#f5f0e8]",
        border:           "border-[#e8e3db]",
        text:             "text-[#1a1a1a]",
        textSecondary:    "text-[#444]",
        textMuted:        "text-[#888]",
        textDimmed:       "text-[#aaa]",
        accent:           "text-[#5aab8b]",
        accentBg:         "bg-[#5aab8b]",
        creamCard:        "bg-[#f0ebe3]",
        creamCardInner:   "bg-[#e4ded5]",
        creamCardText:    "text-[#1a1a1a]",
        creamCardSubtext: "text-[#777]",
        navInactive:      "text-[#bbb]",
      };

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, isDark, colors, cardVariant, setCardVariant, appTheme, setAppTheme, themeConfig }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
