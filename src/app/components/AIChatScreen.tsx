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
  FolderPlus,
  ChevronDown,
  Languages,
  Mic,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { useTheme } from "./ThemeContext";

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

interface SavedWord extends ArabicWord {
  id: string;
}

const topicResponses: Record<
  string,
  { reply: string; words: ArabicWord[] }
> = {
  greetings: {
    reply: "Great choice! Let's learn some Arabic greetings:",
    words: [
      {
        arabic: "\u0645\u0631\u062D\u0628\u0627",
        transliteration: "marhaba",
        english: "hello",
      },
      {
        arabic:
          "\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064A\u0643\u0645",
        transliteration: "as-salamu alaykum",
        english: "peace be upon you",
      },
      {
        arabic:
          "\u0635\u0628\u0627\u062D \u0627\u0644\u062E\u064A\u0631",
        transliteration: "sabah al-khayr",
        english: "good morning",
      },
      {
        arabic: "\u0643\u064A\u0641 \u062D\u0627\u0644\u0643",
        transliteration: "kayf halak",
        english: "how are you",
      },
      {
        arabic: "\u0634\u0643\u0631\u0627\u064B",
        transliteration: "shukran",
        english: "thank you",
      },
    ],
  },
  food: {
    reply:
      "Delicious topic! Here are common Arabic food words:",
    words: [
      {
        arabic: "\u0637\u0639\u0627\u0645",
        transliteration: "ta'am",
        english: "food",
      },
      {
        arabic: "\u0645\u0627\u0621",
        transliteration: "ma'",
        english: "water",
      },
      {
        arabic: "\u062E\u0628\u0632",
        transliteration: "khubz",
        english: "bread",
      },
      {
        arabic: "\u0644\u062D\u0645",
        transliteration: "lahm",
        english: "meat",
      },
      {
        arabic: "\u0641\u0627\u0643\u0647\u0629",
        transliteration: "fakiha",
        english: "fruit",
      },
    ],
  },
  family: {
    reply: "Family is very important in Arabic culture!",
    words: [
      {
        arabic: "\u0639\u0627\u0626\u0644\u0629",
        transliteration: "a'ila",
        english: "family",
      },
      {
        arabic: "\u0623\u0628",
        transliteration: "ab",
        english: "father",
      },
      {
        arabic: "\u0623\u0645",
        transliteration: "umm",
        english: "mother",
      },
      {
        arabic: "\u0623\u062E",
        transliteration: "akh",
        english: "brother",
      },
      {
        arabic: "\u0623\u062E\u062A",
        transliteration: "ukht",
        english: "sister",
      },
    ],
  },
  numbers: {
    reply: "Let's learn to count in Arabic:",
    words: [
      {
        arabic: "\u0648\u0627\u062D\u062F",
        transliteration: "wahid",
        english: "one",
      },
      {
        arabic: "\u0627\u062B\u0646\u0627\u0646",
        transliteration: "ithnan",
        english: "two",
      },
      {
        arabic: "\u062B\u0644\u0627\u062B\u0629",
        transliteration: "thalatha",
        english: "three",
      },
      {
        arabic: "\u0623\u0631\u0628\u0639\u0629",
        transliteration: "arba'a",
        english: "four",
      },
      {
        arabic: "\u062E\u0645\u0633\u0629",
        transliteration: "khamsa",
        english: "five",
      },
    ],
  },
  colors: {
    reply: "Colors make everything more vivid!",
    words: [
      {
        arabic: "\u0623\u062D\u0645\u0631",
        transliteration: "ahmar",
        english: "red",
      },
      {
        arabic: "\u0623\u0632\u0631\u0642",
        transliteration: "azraq",
        english: "blue",
      },
      {
        arabic: "\u0623\u062E\u0636\u0631",
        transliteration: "akhdar",
        english: "green",
      },
      {
        arabic: "\u0623\u0628\u064A\u0636",
        transliteration: "abyad",
        english: "white",
      },
      {
        arabic: "\u0623\u0633\u0648\u062F",
        transliteration: "aswad",
        english: "black",
      },
    ],
  },
  emotions: {
    reply: "Expressing emotions is essential!",
    words: [
      {
        arabic: "\u0633\u0639\u064A\u062F",
        transliteration: "sa'id",
        english: "happy",
      },
      {
        arabic: "\u062D\u0632\u064A\u0646",
        transliteration: "hazin",
        english: "sad",
      },
      {
        arabic: "\u062D\u0628",
        transliteration: "hubb",
        english: "love",
      },
      {
        arabic: "\u0623\u0645\u0644",
        transliteration: "amal",
        english: "hope",
      },
      {
        arabic: "\u0641\u0631\u062D",
        transliteration: "farah",
        english: "joy",
      },
    ],
  },
  travel: {
    reply: "Essential words for traveling in Arabic countries:",
    words: [
      {
        arabic: "\u0645\u0637\u0627\u0631",
        transliteration: "matar",
        english: "airport",
      },
      {
        arabic: "\u0641\u0646\u062F\u0642",
        transliteration: "funduq",
        english: "hotel",
      },
      {
        arabic: "\u0633\u0648\u0642",
        transliteration: "suq",
        english: "market",
      },
      {
        arabic: "\u0645\u062F\u064A\u0646\u0629",
        transliteration: "madina",
        english: "city",
      },
      {
        arabic: "\u0628\u062D\u0631",
        transliteration: "bahr",
        english: "sea",
      },
    ],
  },
};

const topicSuggestions = [
  { key: "greetings", label: "Greetings" },
  { key: "food", label: "Food & Drinks" },
  { key: "family", label: "Family" },
  { key: "numbers", label: "Numbers" },
  { key: "colors", label: "Colors" },
  { key: "emotions", label: "Emotions" },
  { key: "travel", label: "Travel" },
];

function detectTopic(message: string): string | null {
  const lower = message.toLowerCase();
  const topicKeywords: Record<string, string[]> = {
    greetings: ["hello", "hi", "greet", "greeting", "hey"],
    food: ["food", "eat", "drink", "hungry", "cook"],
    family: ["family", "mother", "father", "brother", "sister"],
    numbers: ["number", "count", "math"],
    colors: ["color", "colour", "red", "blue", "green"],
    emotions: ["emotion", "feel", "happy", "sad", "love"],
    travel: ["travel", "trip", "airport", "hotel", "city"],
  };
  for (const [topic, keywords] of Object.entries(
    topicKeywords,
  )) {
    if (keywords.some((kw) => lower.includes(kw))) return topic;
  }
  return null;
}

export function AIChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ai",
      text: "\u0623\u0647\u0644\u0627\u064B \u0648\u0633\u0647\u0644\u0627\u064B! Welcome! I'm your Arabic language assistant.\n\nTap on any Arabic word to save it. Pick a topic or just ask!",
      arabicWords: [
        {
          arabic:
            "\u0623\u0647\u0644\u0627\u064B \u0648\u0633\u0647\u0644\u0627\u064B",
          transliteration: "ahlan wa sahlan",
          english: "welcome",
        },
      ],
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [coveredTopics, setCoveredTopics] = useState<
    Set<string>
  >(new Set());

  const chatEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { colors, isDark } = useTheme();

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";
  const accentBg = isDark ? "bg-[#7ec8a9]" : "bg-[#5aab8b]";
  const aiBubbleBg = isDark
    ? "bg-[#2a2a2a]"
    : "bg-white shadow-sm";
  const userBubbleBg = isDark ? "bg-[#7ec8a9]" : "bg-[#5aab8b]";
  const wordChipBg = isDark ? "bg-[#1a3a2a]" : "bg-[#e6f5ee]";
  const wordChipSaved = isDark
    ? "bg-[#7ec8a9]/20 border-[#7ec8a9]"
    : "bg-[#5aab8b]/10 border-[#5aab8b]";
  const inputBg = isDark
    ? "bg-[#2a2a2a]"
    : "bg-white shadow-sm";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const isWordSaved = useCallback(
    (arabic: string) =>
      savedWords.some((w) => w.arabic === arabic),
    [savedWords],
  );

  const toggleSaveWord = (word: ArabicWord) => {
    setSavedWords((prev) => {
      if (prev.some((w) => w.arabic === word.arabic))
        return prev.filter((w) => w.arabic !== word.arabic);
      return [
        ...prev,
        { ...word, id: `${word.arabic}-${Date.now()}` },
      ];
    });
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    setTimeout(
      () => {
        const topic = detectTopic(text);
        let response: { reply: string; words: ArabicWord[] };
        if (
          topic &&
          topicResponses[topic] &&
          !coveredTopics.has(topic)
        ) {
          response = topicResponses[topic];
          setCoveredTopics((prev) => new Set([...prev, topic]));
        } else {
          response = {
            reply:
              "Try picking a topic below, or ask about greetings, food, family, numbers, colors, emotions, or travel!",
            words: [],
          };
        }
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "ai",
          text: response.reply,
          arabicWords:
            response.words.length > 0
              ? response.words
              : undefined,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsTyping(false);
      },
      800 + Math.random() * 700,
    );
  };

  const handleTopicTap = (topicKey: string) => {
    const label =
      topicSuggestions.find((t) => t.key === topicKey)?.label ??
      topicKey;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: `Teach me about ${label}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    setTimeout(() => {
      const response = topicResponses[topicKey];
      if (response) {
        setCoveredTopics(
          (prev) => new Set([...prev, topicKey]),
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: "ai",
            text: response.reply,
            arabicWords: response.words,
            timestamp: new Date(),
          },
        ]);
      }
      setIsTyping(false);
    }, 800);
  };

  const availableTopics = topicSuggestions.filter(
    (t) => !coveredTopics.has(t.key),
  );

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-4 pt-12 pb-3 ${colors.bg} border-b ${colors.border}`}
      >
        <button
          onClick={() => navigate(-1)}
          className={colors.textMuted}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex items-center gap-2.5 flex-1">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: accentColor }}
          >
            <Languages size={18} className="text-white" />
          </div>
          <div>
            <h2 className={`${colors.text} text-[15px]`}>
              Arabic Assistant
            </h2>
            <p
              className="text-[11px]"
              style={{ color: accentColor }}
            >
              Online
            </p>
          </div>
        </div>
        {savedWords.length > 0 && (
          <button
            onClick={() => setShowSavedPanel(!showSavedPanel)}
            className="relative p-2"
          >
            <BookmarkPlus
              size={20}
              style={{ color: accentColor }}
            />
            <span
              className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center"
              style={{ backgroundColor: accentColor }}
            >
              {savedWords.length}
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
                <span className={`${colors.text} text-sm`}>
                  Saved words ({savedWords.length})
                </span>
                <button
                  onClick={() => setShowSavedPanel(false)}
                >
                  <ChevronDown
                    size={18}
                    className={colors.textMuted}
                  />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {savedWords.map((w) => (
                  <span
                    key={w.id}
                    className={`px-2.5 py-1 rounded-full text-xs border ${wordChipSaved} flex items-center gap-1.5`}
                  >
                    <span style={{ color: accentColor }}>
                      {w.arabic}
                    </span>
                    <span className={colors.textDimmed}>•</span>
                    <span className={colors.textSecondary}>
                      {w.english}
                    </span>
                    <button
                      onClick={() => toggleSaveWord(w)}
                      className="ml-0.5"
                    >
                      <X
                        size={12}
                        className={colors.textDimmed}
                      />
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
            <div
              className={`max-w-[85%] ${msg.role === "user" ? "" : "flex gap-2"}`}
            >
              {msg.role === "ai" && (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                  style={{ backgroundColor: accentColor }}
                >
                  <Sparkles size={14} className="text-white" />
                </div>
              )}
              <div>
                <div
                  className={`rounded-2xl px-4 py-3 ${msg.role === "user" ? `${userBubbleBg} text-white rounded-br-md` : `${aiBubbleBg} ${colors.text} rounded-bl-md`}`}
                >
                  <p className="text-[14px] whitespace-pre-line">
                    {msg.text}
                  </p>
                </div>
                {msg.arabicWords &&
                  msg.arabicWords.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.arabicWords.map((w) => {
                        const saved = isWordSaved(w.arabic);
                        return (
                          <button
                            key={w.arabic}
                            onClick={() => toggleSaveWord(w)}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${saved ? wordChipSaved : `${wordChipBg} ${isDark ? "border-[#2a3a2e]" : "border-[#d0e8da]"}`}`}
                          >
                            <div className="flex items-center gap-3 text-left">
                              <span className="text-[17px]">
                                {w.arabic}
                              </span>
                              <div className="flex flex-col">
                                <span
                                  className={`${colors.textMuted} text-[11px] italic`}
                                >
                                  {w.transliteration}
                                </span>
                                <span
                                  className={`${colors.textSecondary} text-[12px]`}
                                >
                                  {w.english}
                                </span>
                              </div>
                            </div>
                            {saved ? (
                              <Check
                                size={16}
                                style={{ color: accentColor }}
                              />
                            ) : (
                              <BookmarkPlus
                                size={16}
                                className={colors.textDimmed}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="flex gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                <Sparkles size={14} className="text-white" />
              </div>
              <div
                className={`${aiBubbleBg} rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1`}
              >
                {[0, 0.2, 0.4].map((d) => (
                  <motion.span
                    key={d}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.2,
                      delay: d,
                    }}
                    className={`w-2 h-2 rounded-full ${isDark ? "bg-[#666]" : "bg-[#bbb]"}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Topic Suggestions */}
      {availableTopics.length > 0 && (
        <div className={`px-4 py-2 border-t ${colors.border}`}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {availableTopics.map((topic) => (
              <button
                key={topic.key}
                onClick={() => handleTopicTap(topic.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors ${isDark ? "border-[#333] text-[#ccc]" : "border-[#e0dbd3] text-[#666]"}`}
              >
                {topic.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div
        className={`px-4 py-3 ${colors.bg} border-t ${colors.border}`}
      >
        <div
          className={`flex items-center gap-2 ${inputBg} rounded-2xl px-4 py-2`}
        >
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className={`flex-1 bg-transparent outline-none text-sm ${colors.text}`}
            style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-opacity ${inputText.trim() ? accentBg : isDark ? "bg-[#333]" : "bg-[#e8e3db]"} ${!inputText.trim() ? "opacity-50" : ""}`}
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}