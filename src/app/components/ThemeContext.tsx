import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
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

const ThemeContext = createContext<ThemeContextType | null>(
  null,
);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("light");

  const isDark = theme === "dark";

  const colors = isDark
    ? {
        bg: "bg-[#1a1a1a]",
        card: "bg-[#2a2a2a]",
        cardHover: "active:bg-[#333]",
        border: "border-[#2a2a2a]",
        text: "text-[#f5f0e8]",
        textSecondary: "text-[#ccc]",
        textMuted: "text-[#999]",
        textDimmed: "text-[#666]",
        accent: "text-[#7ec8a9]",
        accentBg: "bg-[#7ec8a9]",
        creamCard: "bg-[#f5f0e8]",
        creamCardInner: "bg-[#e8e3db]",
        creamCardText: "text-[#1a1a1a]",
        creamCardSubtext: "text-[#666]",
        navInactive: "text-[#666]",
      }
    : {
        bg: "bg-[#faf7f2]",
        card: "bg-white",
        cardHover: "active:bg-[#f5f0e8]",
        border: "border-[#e8e3db]",
        text: "text-[#1a1a1a]",
        textSecondary: "text-[#444]",
        textMuted: "text-[#888]",
        textDimmed: "text-[#aaa]",
        accent: "text-[#5aab8b]",
        accentBg: "bg-[#5aab8b]",
        creamCard: "bg-[#f0ebe3]",
        creamCardInner: "bg-[#e4ded5]",
        creamCardText: "text-[#1a1a1a]",
        creamCardSubtext: "text-[#777]",
        navInactive: "text-[#bbb]",
      };

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, isDark, colors }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx)
    throw new Error(
      "useTheme must be used within ThemeProvider",
    );
  return ctx;
}