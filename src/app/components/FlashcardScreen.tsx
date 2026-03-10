import { useState, useCallback, useRef } from "react";
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
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { words } from "../data/flashcardData";
import { useTheme } from "./ThemeContext";
import { usePurchase } from "../contexts/PurchaseContext";
import { useAuth } from "../contexts/AuthContext";
import { useUserData } from "../contexts/UserDataContext";

export function FlashcardScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [direction, setDirection] = useState(0);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  const [showHeart, setShowHeart] = useState<"like" | "unlike" | false>(false);

  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { colors, isDark, cardVariant, themeConfig } = useTheme();
  const { hasPurchased } = usePurchase();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { favorites, loved, toggleFavorite, toggleLoved } = useUserData();

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

  const showLimitWarning = (isPaid: boolean) => {
    setLimitWarning(
        isPaid
            ? "250 MB storage limit reached."
            : "50 MB free limit reached. Upgrade for 250 MB.",
    );
    setTimeout(() => setLimitWarning(null), 4000);
  };

  const handleToggleFavorite = async () => {
    const r = await toggleFavorite(currentWord.id);
    if (r && !r.ok) showLimitWarning(r.isPaidLimit);
  };

  const handleToggleLoved = async () => {
    const r = await toggleLoved(currentWord.id);
    if (r && !r.ok) showLimitWarning(r.isPaidLimit);
  };

  const handleCardTap = useCallback(() => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta < 300) {
      // Double tap — toggle like
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      handleToggleFavorite();
      setShowHeart(favorites.has(currentWord.id) ? "unlike" : "like");
      setTimeout(() => setShowHeart(false), 800);
      return;
    }

    // Single tap — flip after short delay
    tapTimerRef.current = setTimeout(() => {
      setIsFlipped((f) => !f);
      tapTimerRef.current = null;
    }, 200);
  }, [currentWord?.id, favorites, handleToggleFavorite]);

  const handleLockedNav = (route: string) => {
    if (hasPurchased) navigate(route);
    else navigate("/payments");
  };

  const accentColor = isDark ? themeConfig.accent : "#5aab8b";
  const progressBg  = isDark ? "bg-[#2a2a2a]" : "bg-[#e8e3db]";
  const btnBg       = isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm";
  const topBtnBg    = isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm";

  return (
      <div className="flex flex-col h-full px-5 md:px-8 pt-10 pb-3 relative">

        {/* Limit warning toast */}
        <AnimatePresence>
          {limitWarning && (
              <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="absolute top-4 left-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#c9a96e]/90 text-white text-sm shadow-lg"
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{limitWarning}</span>
              </motion.div>
          )}
        </AnimatePresence>

        {/* ── Top Bar — Profile · Progress · Stats ─────────────────────────── */}
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
            <span className={`${colors.textMuted} text-xs`}>{currentIndex + 1}/{words.length}</span>
            <div className={`flex-1 h-1 ${progressBg} rounded-full overflow-hidden`}>
              <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / words.length) * 100}%`, backgroundColor: accentColor }}
              />
            </div>
          </div>

          {/* Stats — stays on top bar */}
          <button
              onClick={() => handleLockedNav("/stats")}
              className={`w-10 h-10 rounded-full ${topBtnBg} flex items-center justify-center relative`}
          >
            <BarChart3 size={18} className={colors.textMuted} />
            {!hasPurchased && (
                <Lock size={8} className="absolute -top-0.5 -right-0.5 text-[#c9a96e]" />
            )}
          </button>
        </div>

        {/* ── Card Area ─────────────────────────────────────────────────────── */}
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
                  className="w-full cursor-pointer perspective-[1000px] relative"
                  onClick={handleCardTap}
              >
                {cardVariant === "default" ? (
                  /* ── Default variant — no background, text on page ── */
                  <div className="relative w-full min-h-[340px] md:min-h-[380px] lg:min-h-[420px] flex flex-col">
                    <AnimatePresence mode="wait">
                      {!isFlipped ? (
                        <motion.div
                          key="front"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="flex-1 flex flex-col items-center justify-center gap-5"
                        >
                          {/* Neon part-of-speech tag */}
                          <span
                            className="text-[10px] font-semibold tracking-[0.15em] uppercase px-3 py-1.5 rounded-full"
                            style={{
                              color: isDark ? themeConfig.accent : "#5aab8b",
                              background: isDark ? `${themeConfig.accent}15` : "#5aab8b12",
                              boxShadow: isDark
                                ? `0 0 12px ${themeConfig.accent}20, inset 0 0 12px ${themeConfig.accent}08`
                                : "none",
                              border: `1px solid ${isDark ? `${themeConfig.accent}25` : "#5aab8b20"}`,
                            }}
                          >
                            {currentWord.partOfSpeech}
                          </span>
                          <h1
                            className="text-[40px] md:text-[48px] lg:text-[56px] text-center leading-none"
                            style={{
                              fontFamily: "'Playfair Display', Georgia, serif",
                              color: isDark ? "#eeeeee" : "#1a1a1a",
                            }}
                          >
                            {currentWord.word}
                          </h1>
                          <span
                            className="text-sm font-mono"
                            style={{ color: isDark ? "#6b6b6b" : "#aaa" }}
                          >
                            {currentWord.phonetic}
                          </span>
                          <span
                            className="text-xs mt-2"
                            style={{ color: isDark ? "#444" : "#ccc" }}
                          >
                            tap to reveal
                          </span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="back"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="flex-1 flex flex-col items-center justify-center gap-5 px-2"
                        >
                          <h2
                            className="text-2xl text-center"
                            style={{
                              fontFamily: "'Playfair Display', Georgia, serif",
                              color: isDark ? "#606060" : "#bbb",
                            }}
                          >
                            {currentWord.word}
                          </h2>
                          <p
                            className="text-base text-center leading-relaxed max-w-[320px]"
                            style={{ color: isDark ? "#d0d0d0" : "#333" }}
                          >
                            {currentWord.definition}
                          </p>
                          <p
                            className="text-sm italic text-center max-w-[280px]"
                            style={{ color: isDark ? "#555" : "#aaa" }}
                          >
                            "{currentWord.example}"
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : cardVariant === "notion" ? (
                  /* ── Notion variant (no flip — slides content) ── */
                  <div
                    className="relative w-full min-h-[340px] md:min-h-[380px] lg:min-h-[420px] rounded-2xl overflow-hidden flex flex-col"
                    style={{
                      background: "#111111",
                      border: "1px solid #262626",
                      boxShadow: "0 0 0 1px #1a1a1a, 0 20px 60px rgba(0,0,0,0.6)",
                    }}
                  >
                    {/* Left accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: `linear-gradient(180deg, ${themeConfig.accent} 0%, ${themeConfig.accent}88 100%)` }} />

                    {/* Header row */}
                    <div className="flex items-center justify-between px-6 pt-5 pb-0 ml-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-md"
                          style={{
                            background: `${themeConfig.accent}20`,
                            color: themeConfig.accent,
                            boxShadow: `0 0 10px ${themeConfig.accent}15`,
                          }}
                        >
                          {currentWord.partOfSpeech}
                        </span>
                      </div>
                      <span className="text-[#383838] text-[11px] font-mono">{currentWord.phonetic}</span>
                    </div>

                    {/* Front face (word) */}
                    <AnimatePresence mode="wait">
                      {!isFlipped ? (
                        <motion.div
                          key="front"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                          className="flex-1 flex flex-col items-center justify-center px-6 pb-6 ml-1"
                        >
                          <h1
                            className="text-[#f0f0f0] text-[36px] md:text-[42px] lg:text-[50px] mb-2 text-center"
                            style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.5px" }}
                          >
                            {currentWord.word}
                          </h1>
                          {/* Divider */}
                          <div className="w-8 h-px mb-5" style={{ background: `${themeConfig.accent}30` }} />
                          <span className="text-[#2e2e2e] text-xs tracking-wide">tap to reveal</span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="back"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                          className="flex-1 flex flex-col justify-center px-6 pb-6 ml-1 gap-4"
                        >
                          <div>
                            <p className="text-[#888] text-[10px] uppercase tracking-widest mb-1.5">Definition</p>
                            <p className="text-[#d4d4d4] text-base leading-relaxed">{currentWord.definition}</p>
                          </div>
                          <div
                            className="rounded-xl p-4"
                            style={{ background: "#1a1a1a", borderLeft: `2px solid ${themeConfig.accent}30` }}
                          >
                            <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: `${themeConfig.accent}60` }}>Example</p>
                            <p className="text-[#555] text-sm italic leading-relaxed">"{currentWord.example}"</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Bottom word echo */}
                    <div className="px-6 pb-4 ml-1">
                      <p
                        className="text-[13px]"
                        style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#2a2a2a" }}
                      >
                        {currentWord.word}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* ── Classic variant (original 3D flip) ── */
                  <motion.div
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: 0.5 }}
                      style={{ transformStyle: "preserve-3d" }}
                      className="relative w-full min-h-[340px] md:min-h-[380px] lg:min-h-[420px]"
                  >
                    {/* Front */}
                    <div
                        className={`absolute inset-0 ${colors.creamCard} rounded-3xl p-8 flex flex-col items-center justify-center ${!isDark ? "shadow-lg shadow-black/5" : ""}`}
                        style={{ backfaceVisibility: "hidden" }}
                    >
                      <div className={`${colors.creamCardText} text-[11px] tracking-widest uppercase mb-6 opacity-60`}>
                        {currentWord.partOfSpeech}
                      </div>
                      <h1
                          className={`${colors.creamCardText} text-[32px] md:text-[38px] lg:text-[44px] mb-3 italic`}
                          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                      >
                        {currentWord.word}
                      </h1>
                      <div className={`${colors.creamCardSubtext} text-sm mb-8`}>{currentWord.phonetic}</div>
                      <div className={`${colors.textMuted} text-xs`}>Tap to reveal definition</div>
                    </div>

                    {/* Back */}
                    <div
                        className={`absolute inset-0 ${colors.creamCard} rounded-3xl p-8 flex flex-col items-center justify-center ${!isDark ? "shadow-lg shadow-black/5" : ""}`}
                        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                    >
                      <div className={`${colors.creamCardText} text-[11px] tracking-widest uppercase mb-4 opacity-60`}>
                        {currentWord.partOfSpeech}
                      </div>
                      <h2
                          className={`${colors.creamCardText} text-[28px] md:text-[34px] lg:text-[40px] mb-4 italic`}
                          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                      >
                        {currentWord.word}
                      </h2>
                      <p className={`${isDark ? "text-[#333]" : "text-[#555]"} text-center mb-6`}>
                        {currentWord.definition}
                      </p>
                      <div className={`${colors.creamCardInner} rounded-2xl p-4 w-full`}>
                        <p className={`${isDark ? "text-[#555]" : "text-[#666]"} text-sm italic text-center`}>
                          "{currentWord.example}"
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Double-tap heart animation */}
                <AnimatePresence>
                  {showHeart && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 1.3, opacity: 0 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none z-10"
                    >
                      <Heart
                        size={72}
                        className="drop-shadow-lg"
                        style={
                          showHeart === "like"
                            ? { color: "#f87171", fill: "#f87171" }
                            : { color: "#9ca3af", fill: "none", strokeWidth: 1.5 }
                        }
                      />
                      <span
                        className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={
                          showHeart === "like"
                            ? { background: "rgba(248,113,113,0.15)", color: "#f87171" }
                            : { background: "rgba(156,163,175,0.15)", color: "#9ca3af" }
                        }
                      >
                        {showHeart === "like" ? "Added to favourites" : "Removed from favourites"}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Prev / Next ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <button onClick={goPrev} disabled={currentIndex === 0} className={`p-3 md:p-4 rounded-full ${btnBg} disabled:opacity-30`}>
            <ChevronLeft size={20} className={`${colors.textMuted} md:w-6 md:h-6`} />
          </button>
          <button onClick={goNext} disabled={currentIndex === words.length - 1} className={`p-3 md:p-4 rounded-full ${btnBg} disabled:opacity-30`}>
            <ChevronRight size={20} className={`${colors.textMuted} md:w-6 md:h-6`} />
          </button>
        </div>

        {/* ── Action buttons row ────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-5 mb-3">
          <button className={`p-3 md:p-3.5 rounded-full ${btnBg}`}>
            <Info size={18} className={`${colors.textMuted} md:w-5 md:h-5`} />
          </button>
          <button className={`p-3 md:p-3.5 rounded-full ${btnBg}`}>
            <Share2 size={18} className={`${colors.textMuted} md:w-5 md:h-5`} />
          </button>
          <button onClick={handleToggleFavorite} className={`p-3 md:p-3.5 rounded-full ${btnBg} transition-colors`}>
            <Heart
                size={18}
                className={`md:w-5 md:h-5 ${favorites.has(currentWord.id) ? "text-red-400 fill-red-400" : colors.textMuted}`}
            />
          </button>
          <button onClick={handleToggleLoved} className={`p-3 md:p-3.5 rounded-full ${btnBg} transition-colors`}>
            <Bookmark
                size={18}
                className={`md:w-5 md:h-5 ${loved.has(currentWord.id) ? "" : colors.textMuted}`}
                style={loved.has(currentWord.id) ? { color: accentColor, fill: accentColor } : {}}
            />
          </button>
        </div>

        {/* ── Bottom action bar — Categories · Practice · AI Chat ───────────── */}
        <div className="flex items-center justify-between gap-3">
          {/* Categories */}
          <button
              onClick={() => navigate("/categories")}
              className={`w-12 h-12 md:w-14 md:h-14 rounded-full ${btnBg} flex items-center justify-center`}
          >
            <Grid3X3 size={20} className={`${colors.textMuted} md:w-6 md:h-6`} />
          </button>

          {/* Practice */}
          <button
              onClick={() => handleLockedNav("/practice")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 md:py-3.5 rounded-2xl ${btnBg} relative`}
          >
            <GraduationCap size={18} className={`${colors.textSecondary} md:w-5 md:h-5`} />
            <span className={`${colors.textSecondary} text-sm md:text-base`}>Practice</span>
            {!hasPurchased && <Lock size={10} className="text-[#c9a96e] ml-1" />}
          </button>

          {/* AI Chat — accent-coloured so it stands out */}
          <button
              onClick={() => navigate("/chat")}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center shadow-md transition-transform active:scale-95"
              style={{ backgroundColor: accentColor }}
              title="AI Arabic Tutor"
          >
            <Sparkles size={20} className="text-white md:w-6 md:h-6" />
          </button>
        </div>
      </div>
  );
}