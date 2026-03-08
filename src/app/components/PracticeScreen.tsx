import { useState } from "react";
import { X, Zap, CheckCircle2, XCircle, ArrowRight, Clock, Trophy, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { words } from "../data/flashcardData";
import { useTheme } from "./ThemeContext";
import { usePurchase } from "../contexts/PurchaseContext";
import { useNavigate } from "react-router";

import imgVocabulary from "../../assets/2ba30e58edf3ccfda41166fc36258ccf3f4f76f1.png";
import imgSynonyms from "../../assets/9eeab26df9b6053fe15b3fcf6e6f40f05ad27222.png";
import imgAntonyms from "../../assets/e500e6d028446226a1ca5f40b2b0d1db3205632a.png";
import imgDefinitions from "../../assets/29c5bab39e327da86422f103678424e250ff4c3c.png";
import imgSpelling from "../../assets/c2f739072cd19db867b3eb6e0f3b094ee3fac434.png";
import imgContext from "../../assets/2a1d8de142392ff5f1bdf9eb56bf6963c7e673bc.png";
import imgWordRoots from "../../assets/8049752b65600b9fb880a096268ba27881ca9d1d.png";
import imgIdioms from "../../assets/53c04639ad24021b57ffca2fbbd4b35fd5ce4238.png";

type PracticeState = "menu" | "quiz" | "result";
type DifficultyLevel = "easy" | "medium" | "hard";
type PracticeMode = "flashcards" | "quiz" | "timed" | "challenge";

interface QuizQuestion {
  word: string;
  correctAnswer: string;
  options: string[];
}

const practiceModes: { id: PracticeMode; label: string; description: string; icon: React.ElementType }[] = [
  { id: "flashcards", label: "Flashcards", description: "Classic card flipping", icon: Zap },
  { id: "quiz", label: "Quiz", description: "Multiple choice questions", icon: HelpCircle },
  { id: "timed", label: "Timed", description: "Race against the clock", icon: Clock },
  { id: "challenge", label: "Challenge", description: "Test your mastery", icon: Trophy },
];

const topicsList = [
  { id: "vocabulary", name: "Vocabulary", image: imgVocabulary },
  { id: "synonyms", name: "Synonyms", image: imgSynonyms },
  { id: "antonyms", name: "Antonyms", image: imgAntonyms },
  { id: "definitions", name: "Definitions", image: imgDefinitions },
  { id: "spelling", name: "Spelling", image: imgSpelling },
  { id: "context", name: "Context", image: imgContext },
  { id: "word-roots", name: "Word Roots", image: imgWordRoots },
  { id: "idioms", name: "Idioms", image: imgIdioms },
];

function generateQuestions(): QuizQuestion[] {
  const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 5);
  return shuffled.map((w) => {
    const wrongAnswers = words.filter((o) => o.id !== w.id).sort(() => Math.random() - 0.5).slice(0, 3).map((o) => o.definition);
    const options = [...wrongAnswers, w.definition].sort(() => Math.random() - 0.5);
    return { word: w.word, correctAnswer: w.definition, options };
  });
}

export function PracticeScreen() {
  const [state, setState] = useState<PracticeState>("menu");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [level, setLevel] = useState<DifficultyLevel>("medium");
  const [activeMode, setActiveMode] = useState<PracticeMode>("flashcards");
  const { colors, isDark } = useTheme();
  const { hasPurchased } = usePurchase();
  const navigate = useNavigate();

  const gold = "#c9a96e";
  const goldBg = isDark ? "rgba(201,169,110,0.12)" : "rgba(201,169,110,0.15)";
  const goldBorder = isDark ? "rgba(201,169,110,0.3)" : "rgba(201,169,110,0.35)";
  const goldText = gold;
  const dimText = isDark ? "rgba(245,240,232,0.4)" : "rgba(100,90,75,0.6)";
  const subtleBg = isDark ? "rgba(245,240,232,0.06)" : "rgba(0,0,0,0.04)";
  const subtleBorder = isDark ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.06)";
  const iconBgInactive = isDark ? "rgba(245,240,232,0.08)" : "rgba(0,0,0,0.05)";
  const iconStrokeInactive = isDark ? "rgba(245,240,232,0.5)" : "rgba(100,90,75,0.5)";
  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";
  const progressBg = isDark ? "bg-[#2a2a2a]" : "bg-[#e8e3db]";

  const startQuiz = () => { setQuestions(generateQuestions()); setCurrentQ(0); setScore(0); setSelectedAnswer(null); setIsAnswered(false); setState("quiz"); };
  const handleAnswer = (answer: string) => { if (isAnswered) return; setSelectedAnswer(answer); setIsAnswered(true); if (answer === questions[currentQ].correctAnswer) setScore((p) => p + 1); };
  const nextQuestion = () => { if (currentQ < questions.length - 1) { setCurrentQ((p) => p + 1); setSelectedAnswer(null); setIsAnswered(false); } else setState("result"); };

  if (state === "quiz" && questions.length > 0) {
    const q = questions[currentQ];
    return (
      <div className="flex flex-col h-full px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setState("menu")} className={colors.textMuted}><X size={24} /></button>
          <span className={colors.text}>{currentQ + 1} / {questions.length}</span>
          <div className="w-6" />
        </div>
        <div className={`w-full h-1 ${progressBg} rounded-full overflow-hidden mb-8`}>
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((currentQ + 1) / questions.length) * 100}%`, backgroundColor: accentColor }} />
        </div>
        <div className="mb-8">
          <p className={`${colors.textMuted} text-sm mb-2`}>What's the definition of:</p>
          <h2 className={`${colors.text} text-[28px] italic`} style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{q.word}</h2>
        </div>
        <div className="flex flex-col gap-3 flex-1">
          {q.options.map((option, i) => {
            let bgColor = isDark ? "bg-[#2a2a2a]" : "bg-white";
            let borderColor = "border-transparent";
            if (isAnswered) {
              if (option === q.correctAnswer) { bgColor = isDark ? "bg-[#1a3a2a]" : "bg-[#e6f5ee]"; borderColor = isDark ? "border-[#7ec8a9]" : "border-[#5aab8b]"; }
              else if (option === selectedAnswer) { bgColor = isDark ? "bg-[#3a1a1a]" : "bg-[#fde8e8]"; borderColor = "border-red-400"; }
            }
            return (
              <motion.button key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} onClick={() => handleAnswer(option)} className={`p-4 rounded-2xl text-left border ${bgColor} ${borderColor} transition-colors ${!isDark && !isAnswered ? "shadow-sm" : ""}`}>
                <div className="flex items-center gap-3">
                  {isAnswered && option === q.correctAnswer && <CheckCircle2 size={18} className="text-[#5aab8b] flex-shrink-0" />}
                  {isAnswered && option === selectedAnswer && option !== q.correctAnswer && <XCircle size={18} className="text-red-400 flex-shrink-0" />}
                  <span className={`${colors.textSecondary} text-sm`}>{option}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
        {isAnswered && (
          <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={nextQuestion} className="mt-4 text-white py-4 rounded-2xl flex items-center justify-center gap-2" style={{ backgroundColor: accentColor }}>
            <span>{currentQ < questions.length - 1 ? "Next question" : "See results"}</span>
            <ArrowRight size={18} />
          </motion.button>
        )}
      </div>
    );
  }

  if (state === "result") {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="flex flex-col h-full px-5 pt-12 pb-4 items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center w-full">
          <div className={`w-32 h-32 rounded-full ${colors.card} flex items-center justify-center mx-auto mb-6 ${!isDark ? "shadow-lg" : ""}`}>
            <span className="text-[40px]" style={{ color: gold }}>{percentage}%</span>
          </div>
          <h2 className={`${colors.text} text-2xl mb-2`}>{percentage >= 80 ? "Excellent!" : percentage >= 50 ? "Good job!" : "Keep practicing!"}</h2>
          <p className={`${colors.textMuted} mb-8`}>You got {score} out of {questions.length} correct</p>
          <button onClick={startQuiz} className="text-[#1e1c19] px-8 py-4 rounded-2xl mb-4 w-full" style={{ backgroundColor: gold }}>Try again</button>
          <button onClick={() => setState("menu")} className={`${colors.card} ${colors.textSecondary} px-8 py-4 rounded-2xl w-full ${!isDark ? "shadow-sm" : ""}`}>Back to practice</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => navigate(-1)} className={colors.textMuted}><X size={20} /></button>
          <h2 className={colors.text} style={{ fontSize: 17 }}>Practice</h2>
          <div className="w-8" />
        </div>

        <div className="rounded-2xl px-4 py-4 mb-5" style={{ backgroundColor: goldBg }}>
          <p style={{ color: goldText, fontSize: 14, lineHeight: "22px" }}>Practice makes perfect. Choose your preferred style and difficulty to start learning.</p>
        </div>

        <p className="mb-3 tracking-widest uppercase" style={{ color: dimText, fontSize: 13 }}>What's your level?</p>
        <div className="flex gap-2 mb-6">
          {(["easy", "medium", "hard"] as DifficultyLevel[]).map((lvl) => {
            const isActive = level === lvl;
            return (
              <button key={lvl} onClick={() => setLevel(lvl)} className="flex-1 py-2.5 rounded-[14px] text-center transition-all" style={{ backgroundColor: isActive ? goldBg : subtleBg, border: `1px solid ${isActive ? goldBorder : subtleBorder}`, color: isActive ? goldText : isDark ? "rgba(245,240,232,0.5)" : "rgba(100,90,75,0.5)", fontSize: 13, fontWeight: isActive ? 600 : 400 }}>
                {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
              </button>
            );
          })}
        </div>

        <p className="mb-3 tracking-widest uppercase" style={{ color: dimText, fontSize: 13 }}>Practice mode</p>
        <div className="flex flex-col gap-2.5 mb-6">
          {practiceModes.map((mode) => {
            const isActive = activeMode === mode.id;
            const IconComp = mode.icon;
            return (
              <button key={mode.id} onClick={() => setActiveMode(mode.id)} className="flex items-center gap-3.5 rounded-[14px] px-4 py-3.5 transition-all" style={{ backgroundColor: isActive ? goldBg : subtleBg, border: `1px solid ${isActive ? goldBorder : subtleBorder}` }}>
                <div className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isActive ? "rgba(201,169,110,0.2)" : iconBgInactive }}>
                  <IconComp size={20} strokeWidth={1.7} style={{ color: isActive ? goldText : iconStrokeInactive }} />
                </div>
                <div className="text-left">
                  <p style={{ color: isActive ? goldText : isDark ? "#f5f0e8" : "#1a1a1a", fontSize: 14, fontWeight: 500 }}>{mode.label}</p>
                  <p style={{ color: dimText, fontSize: 12, fontWeight: 500 }}>{mode.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="mb-3 tracking-widest uppercase" style={{ color: dimText, fontSize: 13 }}>Topics</p>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {topicsList.map((topic) => (
            <div key={topic.id} className="relative rounded-2xl overflow-hidden aspect-[1.4/1] cursor-pointer active:scale-[0.97] transition-transform">
              <img src={topic.image} alt={topic.name} className="absolute inset-0 w-full h-full object-cover opacity-70" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${isDark ? "rgba(30,28,25,0.9)" : "rgba(30,28,25,0.7)"} 0%, ${isDark ? "rgba(30,28,25,0.3)" : "rgba(30,28,25,0.1)"} 60%)` }} />
              <p className="absolute bottom-2.5 left-2.5" style={{ color: "#f5f0e8", fontSize: 12, fontWeight: 600 }}>{topic.name}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`px-5 pb-4 pt-2 ${colors.bg}`}>
        <button onClick={startQuiz} className="w-full py-3.5 rounded-2xl text-center transition-all active:scale-[0.98]" style={{ backgroundColor: gold, color: "#1e1c19", fontSize: 15, fontWeight: 600 }}>
          Start Practice
        </button>
      </div>
    </div>
  );
}

