import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  ArrowLeft,
  Send,
  Sparkles,
  BookmarkPlus,
  X,
  Check,
  ChevronDown,
  Languages,
  Mic,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { useTheme } from "./ThemeContext";
import { useUserData } from "../contexts/UserDataContext";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ArabicWord {
  arabic: string;
  transliteration: string;
  english: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  arabicWords?: ArabicWord[];
  timestamp: Date;
}

// ── Static topic data ──────────────────────────────────────────────────────────

const topicResponses: Record<string, { reply: string; words: ArabicWord[] }> = {
  greetings: {
    reply: "Great choice! Let's learn some Arabic greetings:",
    words: [
      { arabic: "مرحبا",        transliteration: "marhaba",           english: "hello"               },
      { arabic: "السلام عليكم", transliteration: "as-salamu alaykum", english: "peace be upon you"   },
      { arabic: "صباح الخير",   transliteration: "sabah al-khayr",    english: "good morning"        },
      { arabic: "كيف حالك",     transliteration: "kayf halak",         english: "how are you"         },
      { arabic: "شكراً",        transliteration: "shukran",            english: "thank you"           },
    ],
  },
  food: {
    reply: "Delicious topic! Here are common Arabic food words:",
    words: [
      { arabic: "طعام",  transliteration: "ta'am",  english: "food"  },
      { arabic: "ماء",   transliteration: "ma'",    english: "water" },
      { arabic: "خبز",   transliteration: "khubz",  english: "bread" },
      { arabic: "لحم",   transliteration: "lahm",   english: "meat"  },
      { arabic: "فاكهة", transliteration: "fakiha", english: "fruit" },
    ],
  },
  family: {
    reply: "Family is very important in Arabic culture!",
    words: [
      { arabic: "أم",  transliteration: "umm",  english: "mother"  },
      { arabic: "أب",  transliteration: "ab",   english: "father"  },
      { arabic: "أخ",  transliteration: "akh",  english: "brother" },
      { arabic: "أخت", transliteration: "ukht", english: "sister"  },
      { arabic: "بيت", transliteration: "bayt", english: "house"   },
    ],
  },
  numbers: {
    reply: "Let's count in Arabic!",
    words: [
      { arabic: "واحد",  transliteration: "wahid",    english: "one"   },
      { arabic: "اثنان", transliteration: "ithnan",   english: "two"   },
      { arabic: "ثلاثة", transliteration: "thalatha", english: "three" },
      { arabic: "أربعة", transliteration: "arba'a",   english: "four"  },
      { arabic: "خمسة",  transliteration: "khamsa",   english: "five"  },
    ],
  },
  colors: {
    reply: "Colors in Arabic are vibrant!",
    words: [
      { arabic: "أحمر", transliteration: "ahmar",  english: "red"    },
      { arabic: "أزرق", transliteration: "azraq",  english: "blue"   },
      { arabic: "أخضر", transliteration: "akhdar", english: "green"  },
      { arabic: "أصفر", transliteration: "asfar",  english: "yellow" },
      { arabic: "أبيض", transliteration: "abyad",  english: "white"  },
    ],
  },
  emotions: {
    reply: "Expressing feelings in Arabic:",
    words: [
      { arabic: "سعيد", transliteration: "sa'id", english: "happy" },
      { arabic: "حزين", transliteration: "hazin", english: "sad"   },
      { arabic: "حب",   transliteration: "hubb",  english: "love"  },
      { arabic: "أمل",  transliteration: "amal",  english: "hope"  },
      { arabic: "فرح",  transliteration: "farah", english: "joy"   },
    ],
  },
  travel: {
    reply: "Essential words for traveling in Arabic countries:",
    words: [
      { arabic: "مطار",  transliteration: "matar",  english: "airport" },
      { arabic: "فندق",  transliteration: "funduq", english: "hotel"   },
      { arabic: "سوق",   transliteration: "suq",    english: "market"  },
      { arabic: "مدينة", transliteration: "madina", english: "city"    },
      { arabic: "بحر",   transliteration: "bahr",   english: "sea"     },
    ],
  },
};

const topicSuggestions = [
  { key: "greetings", label: "Greetings"    },
  { key: "food",      label: "Food & Drinks" },
  { key: "family",    label: "Family"       },
  { key: "numbers",   label: "Numbers"      },
  { key: "colors",    label: "Colors"       },
  { key: "emotions",  label: "Emotions"     },
  { key: "travel",    label: "Travel"       },
];

function detectTopic(message: string): string | null {
  const lower = message.toLowerCase();
  const map: Record<string, string[]> = {
    greetings: ["hello", "hi", "greet", "greeting", "hey"],
    food:      ["food", "eat", "drink", "hungry", "cook"],
    family:    ["family", "mother", "father", "brother", "sister"],
    numbers:   ["number", "count", "math"],
    colors:    ["color", "colour", "red", "blue", "green"],
    emotions:  ["emotion", "feel", "happy", "sad", "love"],
    travel:    ["travel", "trip", "airport", "hotel", "city"],
  };
  for (const [topic, keywords] of Object.entries(map)) {
    if (keywords.some((kw) => lower.includes(kw))) return topic;
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AIChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ai",
      text: "أهلاً وسهلاً! Welcome! I'm your Arabic language assistant.\n\nTap on any Arabic word to save it. Pick a topic or just ask!",
      arabicWords: [{ arabic: "أهلاً وسهلاً", transliteration: "ahlan wa sahlan", english: "welcome" }],
      timestamp: new Date(),
    },
  ]);
  const [inputText,      setInputText]      = useState("");
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [isTyping,       setIsTyping]       = useState(false);
  const [coveredTopics,  setCoveredTopics]  = useState<Set<string>>(new Set());
  const [limitWarning,   setLimitWarning]   = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const navigate   = useNavigate();
  const { colors, isDark } = useTheme();

  const { addedWords, addWord, removeAddedWord } = useUserData();

  const accentColor   = isDark ? "#7ec8a9" : "#5aab8b";
  const aiBubbleBg    = isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm";
  const userBubbleBg  = isDark ? "bg-[#7ec8a9]" : "bg-[#5aab8b]";
  const wordChipBg    = isDark ? "bg-[#1a3a2a]" : "bg-[#e6f5ee]";
  const wordChipSaved = isDark ? "bg-[#7ec8a9]/20 border-[#7ec8a9]" : "bg-[#5aab8b]/10 border-[#5aab8b]";
  const inputBg       = isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Word save / remove ────────────────────────────────────────────────────

  const isWordSaved = useCallback(
      (arabic: string) => addedWords.some((w) => w.arabic === arabic),
      [addedWords],
  );

  const showLimit = (isPaid: boolean) => {
    setLimitWarning(isPaid ? "250 MB limit reached." : "50 MB free limit reached. Upgrade for 250 MB.");
    setTimeout(() => setLimitWarning(null), 4000);
  };

  const handleToggleSaveWord = async (word: ArabicWord) => {
    const existing = addedWords.find((w) => w.arabic === word.arabic);
    if (existing) {
      await removeAddedWord(existing.id);
    } else {
      const result = await addWord({
        id:              `chat-${word.arabic}-${word.transliteration}`,
        arabic:          word.arabic,
        transliteration: word.transliteration,
        english:         word.english,
      });
      if (result && !result.ok) showLimit(result.isPaidLimit);
    }
  };

  const handleRemoveById = async (wordId: string) => {
    await removeAddedWord(wordId);
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", text, timestamp: new Date() }]);
    setInputText("");
    setIsTyping(true);

    setTimeout(() => {
      const topic = detectTopic(text);
      let response: { reply: string; words: ArabicWord[] };

      if (topic && topicResponses[topic] && !coveredTopics.has(topic)) {
        response = topicResponses[topic];
        setCoveredTopics((prev) => new Set([...prev, topic]));
      } else {
        response = { reply: "Try picking a topic below, or ask about greetings, food, family, numbers, colors, emotions, or travel!", words: [] };
      }

      setMessages((prev) => [...prev, {
        id: `ai-${Date.now()}`, role: "ai", text: response.reply,
        arabicWords: response.words.length > 0 ? response.words : undefined,
        timestamp: new Date(),
      }]);
      setIsTyping(false);
    }, 800 + Math.random() * 700);
  };

  const handleTopicTap = (topicKey: string) => {
    const label = topicSuggestions.find((t) => t.key === topicKey)?.label ?? topicKey;
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", text: `Teach me about ${label}`, timestamp: new Date() }]);
    setIsTyping(true);

    setTimeout(() => {
      const response = topicResponses[topicKey];
      if (response) {
        setCoveredTopics((prev) => new Set([...prev, topicKey]));
        setMessages((prev) => [...prev, { id: `ai-${Date.now()}`, role: "ai", text: response.reply, arabicWords: response.words, timestamp: new Date() }]);
      }
      setIsTyping(false);
    }, 800);
  };

  const availableTopics = topicSuggestions.filter((t) => !coveredTopics.has(t.key));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
      <div className="flex flex-col h-full relative">

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

        {/* Header */}
        <div className={`flex items-center gap-3 px-4 pt-12 pb-3 ${colors.bg} border-b ${colors.border}`}>
          <button onClick={() => navigate(-1)} className={colors.textMuted}>
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: accentColor }}>
              <Languages size={18} className="text-white" />
            </div>
            <div>
              <h2 className={`${colors.text} text-[15px]`}>Arabic Assistant</h2>
              <p className="text-[11px]" style={{ color: accentColor }}>Online</p>
            </div>
          </div>
          {addedWords.length > 0 && (
              <button onClick={() => setShowSavedPanel(!showSavedPanel)} className="relative p-2">
                <BookmarkPlus size={20} style={{ color: accentColor }} />
                <span
                    className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center"
                    style={{ backgroundColor: accentColor }}
                >
              {addedWords.length}
            </span>
              </button>
          )}
        </div>

        {/* Saved Words Panel */}
        <AnimatePresence>
          {showSavedPanel && (
              <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={`overflow-hidden ${isDark ? "bg-[#222]" : "bg-[#f5f0e8]"} border-b ${colors.border}`}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`${colors.text} text-sm`}>Saved words ({addedWords.length})</span>
                    <button onClick={() => setShowSavedPanel(false)}>
                      <ChevronDown size={18} className={colors.textMuted} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {addedWords.map((w) => (
                        <span
                            key={w.id}
                            className={`px-2.5 py-1 rounded-full text-xs border ${wordChipSaved} flex items-center gap-1.5`}
                        >
                    <span style={{ color: accentColor }}>{w.arabic}</span>
                    <span className={colors.textDimmed}>•</span>
                    <span className={colors.textSecondary}>{w.english}</span>
                    <button onClick={() => handleRemoveById(w.id)} className="ml-0.5">
                      <X size={12} className={colors.textDimmed} />
                    </button>
                  </span>
                    ))}
                  </div>
                </div>
              </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg) => (
              <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] ${msg.role === "user" ? "" : "flex gap-2"}`}>
                  {msg.role === "ai" && (
                      <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                          style={{ backgroundColor: accentColor }}
                      >
                        <Sparkles size={14} className="text-white" />
                      </div>
                  )}
                  <div>
                    <div className={`rounded-2xl px-4 py-3 ${msg.role === "user" ? `${userBubbleBg} text-white rounded-br-md` : `${aiBubbleBg} ${colors.text} rounded-bl-md`}`}>
                      <p className="text-[14px] whitespace-pre-line">{msg.text}</p>
                    </div>

                    {/* Arabic word chips */}
                    {msg.arabicWords && msg.arabicWords.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {msg.arabicWords.map((w) => {
                            const saved = isWordSaved(w.arabic);
                            return (
                                <button
                                    key={w.arabic}
                                    onClick={() => handleToggleSaveWord(w)}
                                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${
                                        saved ? wordChipSaved : `${wordChipBg} ${isDark ? "border-[#2a3a2e]" : "border-[#d0e8da]"}`
                                    }`}
                                >
                                  <div className="flex items-center gap-3 text-left">
                                    <span className="text-[17px]">{w.arabic}</span>
                                    <div className="flex flex-col">
                                      <span className={`${colors.textMuted} text-[11px] italic`}>{w.transliteration}</span>
                                      <span className={`${colors.textSecondary} text-[12px]`}>{w.english}</span>
                                    </div>
                                  </div>
                                  {saved
                                      ? <Check size={15} style={{ color: accentColor }} />
                                      : <BookmarkPlus size={15} className={colors.textDimmed} />
                                  }
                                </button>
                            );
                          })}
                        </div>
                    )}
                  </div>
                </div>
              </motion.div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accentColor }}>
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className={`${aiBubbleBg} rounded-2xl rounded-bl-md px-4 py-3 flex gap-1 items-center`}>
                  {[0, 1, 2].map((i) => (
                      <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-current opacity-40"
                          animate={{ opacity: [0.3, 0.8, 0.3] }}
                          transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                      />
                  ))}
                </div>
              </div>
          )}

          {/* Topic suggestions */}
          {availableTopics.length > 0 && !isTyping && (
              <div className="flex flex-wrap gap-2 pt-1">
                {availableTopics.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => handleTopicTap(t.key)}
                        className="px-3 py-1.5 rounded-full text-xs border transition-colors"
                        style={{ color: accentColor, borderColor: `${accentColor}50` }}
                    >
                      {t.label}
                    </button>
                ))}
              </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className={`px-4 py-3 border-t ${colors.border} ${colors.bg}`}>
          <div className={`flex items-center gap-2 ${inputBg} rounded-2xl px-4 py-2.5`}>
            <button className={colors.textDimmed}>
              <Mic size={18} />
            </button>
            <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask about Arabic…"
                className={`flex-1 bg-transparent outline-none text-[14px] ${colors.text}`}
            />
            <button
                onClick={handleSend}
                disabled={!inputText.trim()}
                className="disabled:opacity-30 transition-opacity"
                style={{ color: accentColor }}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
  );
}