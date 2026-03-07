import { useState, useCallback } from "react";
import {
  Heart,
  Bookmark,
  Share2,
  Volume2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  User,
  BarChart3,
  Grid3X3,
  GraduationCap,
  Lock,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { words } from "../data/flashcardData";
import { useTheme } from "./ThemeContext";
import { usePurchase } from "../contexts/PurchaseContext";

import { useAuth } from "../contexts/AuthContext";

export function FlashcardScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(),
  );
  const [bookmarks, setBookmarks] = useState<Set<string>>(
    new Set(),
  );
  const [direction, setDirection] = useState(0);
  const { colors, isDark } = useTheme();
  const { hasPurchased } = usePurchase();
  const { user } = useAuth();
  const navigate = useNavigate();

  const currentWord = words[currentIndex];

  const goNext = useCallback(() => {
    if (currentIndex < words.length - 1) {
      setDirection(1);
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setIsFlipped(false);
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const toggleFavorite = () => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(currentWord.id)) next.delete(currentWord.id);
      else next.add(currentWord.id);
      return next;
    });
  };

  const toggleBookmark = () => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(currentWord.id)) next.delete(currentWord.id);
      else next.add(currentWord.id);
      return next;
    });
  };

  const handleLockedNav = (route: string) => {
    if (hasPurchased) {
      navigate(route);
    } else {
      navigate("/payments");
    }
  };

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";
  const progressBg = isDark ? "bg-[#2a2a2a]" : "bg-[#e8e3db]";
  const btnBg = isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm";
  const topBtnBg = isDark
    ? "bg-[#2a2a2a]"
    : "bg-white shadow-sm";

  return (
    <div className="flex flex-col h-full px-5 pt-10 pb-3">
      {/* Top Bar — Profile, Progress, Stats */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigate("/profile")}
          className={`w-10 h-10 rounded-full ${topBtnBg} flex items-center justify-center overflow-hidden`}
        >
          {user?.user_metadata?.avatar_url ? (
            <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
          ) : user?.email ? (
            <span className={`${colors.text} font-medium text-sm uppercase`}>{user.email[0]}</span>
          ) : (
            <User size={18} className={colors.textMuted} />
          )}
        </button>

        <div className="flex items-center gap-2 flex-1 mx-3">
          <Bookmark size={14} className={colors.textMuted} />
          <span className={`${colors.textMuted} text-xs`}>
            {currentIndex + 1}/{words.length}
          </span>
          <div
            className={`flex-1 h-1 ${progressBg} rounded-full overflow-hidden`}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / words.length) * 100}%`,
                backgroundColor: accentColor,
              }}
            />
          </div>
        </div>

        <button
          onClick={() => handleLockedNav("/stats")}
          className={`w-10 h-10 rounded-full ${topBtnBg} flex items-center justify-center relative`}
        >
          <BarChart3 size={18} className={colors.textMuted} />
          {!hasPurchased && (
            <Lock
              size={8}
              className="absolute -top-0.5 -right-0.5 text-[#c9a96e]"
            />
          )}
        </button>
      </div>

      {/* Card Area */}
      <div className="flex-1 flex items-center justify-center my-2">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            initial={{ opacity: 0, x: direction * 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -100 }}
            transition={{ duration: 0.25 }}
            className="w-full"
          >
            <div
              className="w-full cursor-pointer perspective-[1000px]"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <motion.div
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.5 }}
                style={{ transformStyle: "preserve-3d" }}
                className="relative w-full min-h-[340px]"
              >
                {/* Front of card */}
                <div
                  className={`absolute inset-0 ${colors.creamCard} rounded-3xl p-8 flex flex-col items-center justify-center ${!isDark ? "shadow-lg shadow-black/5" : ""}`}
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <div
                    className={`${colors.creamCardText} text-[11px] tracking-widest uppercase mb-6 opacity-60`}
                  >
                    {currentWord.partOfSpeech}
                  </div>
                  <h1
                    className={`${colors.creamCardText} text-[32px] mb-3 italic`}
                    style={{
                      fontFamily:
                        "'Playfair Display', Georgia, serif",
                    }}
                  >
                    {currentWord.word}
                  </h1>
                  <div
                    className={`${colors.creamCardSubtext} text-sm mb-8`}
                  >
                    {currentWord.phonetic}
                  </div>
                  <div
                    className={`${colors.textMuted} text-xs`}
                  >
                    Tap to reveal definition
                  </div>
                </div>

                {/* Back of card */}
                <div
                  className={`absolute inset-0 ${colors.creamCard} rounded-3xl p-8 flex flex-col items-center justify-center ${!isDark ? "shadow-lg shadow-black/5" : ""}`}
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div
                    className={`${colors.creamCardText} text-[11px] tracking-widest uppercase mb-4 opacity-60`}
                  >
                    {currentWord.partOfSpeech}
                  </div>
                  <h2
                    className={`${colors.creamCardText} text-[28px] mb-4 italic`}
                    style={{
                      fontFamily:
                        "'Playfair Display', Georgia, serif",
                    }}
                  >
                    {currentWord.word}
                  </h2>
                  <p
                    className={`${isDark ? "text-[#333]" : "text-[#555]"} text-center mb-6`}
                  >
                    {currentWord.definition}
                  </p>
                  <div
                    className={`${colors.creamCardInner} rounded-2xl p-4 w-full`}
                  >
                    <p
                      className={`${isDark ? "text-[#555]" : "text-[#666]"} text-sm italic text-center`}
                    >
                      "{currentWord.example}"
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action buttons row */}
      <div className="flex items-center justify-center gap-5 mb-3">
        <button className={`p-3 rounded-full ${btnBg}`}>
          <Info size={18} className={colors.textMuted} />
        </button>
        <button className={`p-3 rounded-full ${btnBg}`}>
          <Share2 size={18} className={colors.textMuted} />
        </button>
        <button
          onClick={toggleFavorite}
          className={`p-3 rounded-full ${btnBg} transition-colors`}
        >
          <Heart
            size={18}
            className={
              favorites.has(currentWord.id)
                ? "text-red-400 fill-red-400"
                : colors.textMuted
            }
          />
        </button>
        <button
          onClick={toggleBookmark}
          className={`p-3 rounded-full ${btnBg} transition-colors`}
        >
          <Bookmark
            size={18}
            className={
              bookmarks.has(currentWord.id)
                ? ""
                : colors.textMuted
            }
            style={
              bookmarks.has(currentWord.id)
                ? { color: accentColor, fill: accentColor }
                : {}
            }
          />
        </button>
      </div>

      {/* Bottom action bar — Categories, Practice, Stats */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate("/categories")}
          className={`w-12 h-12 rounded-full ${btnBg} flex items-center justify-center`}
        >
          <Grid3X3 size={20} className={colors.textMuted} />
        </button>

        <button
          onClick={() => handleLockedNav("/practice")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl ${btnBg} relative`}
        >
          <GraduationCap
            size={18}
            className={colors.textSecondary}
          />
          <span className={`${colors.textSecondary} text-sm`}>
            Practice
          </span>
          {!hasPurchased && (
            <Lock size={10} className="text-[#c9a96e] ml-1" />
          )}
        </button>

        <button
          onClick={() => handleLockedNav("/stats")}
          className={`w-12 h-12 rounded-full ${btnBg} flex items-center justify-center relative`}
        >
          <BarChart3 size={20} className={colors.textMuted} />
          {!hasPurchased && (
            <Lock
              size={8}
              className="absolute top-1 right-1 text-[#c9a96e]"
            />
          )}
        </button>
      </div>
    </div>
  );
}