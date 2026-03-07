import { useState } from "react";
import { ArrowLeft, Plus, Trash2, PenLine } from "lucide-react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "./ThemeContext";

interface CustomWord {
  id: string;
  word: string;
  translation: string;
  notes?: string;
}

export function YourWordsScreen() {
  const [words, setWords] = useState<CustomWord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const navigate = useNavigate();
  const { colors, isDark } = useTheme();

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";

  const handleAdd = () => {
    if (!newWord.trim() || !newTranslation.trim()) return;
    const word: CustomWord = {
      id: `cw-${Date.now()}`,
      word: newWord.trim(),
      translation: newTranslation.trim(),
      notes: newNotes.trim() || undefined,
    };
    setWords((prev) => [word, ...prev]);
    setNewWord("");
    setNewTranslation("");
    setNewNotes("");
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setWords((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className={colors.textMuted}>
          <ArrowLeft size={22} />
        </button>
        <h2 className={`${colors.text} text-lg`}>Your own words</h2>
        <button
          onClick={() => setShowForm(true)}
          className="text-sm"
          style={{ color: accentColor }}
        >
          Add
        </button>
      </div>

      {/* Add word form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`mx-5 mb-4 p-4 rounded-2xl ${colors.card} ${!isDark ? "shadow-sm" : ""}`}>
              <input
                type="text"
                placeholder="Word or phrase"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                className={`w-full bg-transparent ${colors.text} outline-none text-sm mb-3 pb-3 border-b ${isDark ? "border-[#333]" : "border-[#e8e3db]"}`}
                style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
              />
              <input
                type="text"
                placeholder="Translation"
                value={newTranslation}
                onChange={(e) => setNewTranslation(e.target.value)}
                className={`w-full bg-transparent ${colors.text} outline-none text-sm mb-3 pb-3 border-b ${isDark ? "border-[#333]" : "border-[#e8e3db]"}`}
                style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className={`w-full bg-transparent ${colors.text} outline-none text-sm mb-4`}
                style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className={`flex-1 py-2.5 rounded-xl text-sm ${colors.card} ${colors.textSecondary} border ${colors.border}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newWord.trim() || !newTranslation.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm text-white disabled:opacity-40"
                  style={{ backgroundColor: accentColor }}
                >
                  Add word
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word list or empty state */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {words.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className={`w-24 h-24 rounded-3xl ${isDark ? "bg-[#2a2a2a]" : "bg-[#f0ebe3]"} flex items-center justify-center mb-6`}>
              <PenLine size={40} className={colors.textDimmed} />
            </div>
            <h3 className={`${colors.text} text-xl mb-2`}>
              You haven't added any words yet
            </h3>
            <p className={`${colors.textMuted} text-sm mb-8`}>
              Add your own words and phrases to practice them alongside your flashcards.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-8 py-3.5 rounded-2xl text-[#1a1a1a] text-sm font-medium"
              style={{ backgroundColor: isDark ? "#f5f0e8" : "#c8e6d8" }}
            >
              Add word
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {words.map((w) => (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${colors.card} rounded-2xl p-4 flex items-center justify-between ${!isDark ? "shadow-sm" : ""}`}
              >
                <div>
                  <p className={`${colors.text} text-sm font-medium`}>{w.word}</p>
                  <p className={`${colors.textMuted} text-xs`}>{w.translation}</p>
                  {w.notes && (
                    <p className={`${colors.textDimmed} text-[11px] mt-1 italic`}>{w.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(w.id)}
                  className="p-2 rounded-lg text-red-400 active:bg-red-400/10"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
