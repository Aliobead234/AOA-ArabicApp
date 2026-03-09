/**
 * FolderWordsScreen.tsx
 *
 * Displays the flashcard words a user has hearted (Favorites) or
 * bookmarked (Collections / Loved), based on the URL param `type`.
 *
 * Route: /folder/:type   (type = "favorites" | "loved")
 */

import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Heart, Bookmark, BookOpen, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useTheme }    from './ThemeContext';
import { useUserData } from '../contexts/UserDataContext';
import { words as allWords } from '../data/flashcardData';

export function FolderWordsScreen() {
    const { type }       = useParams<{ type: string }>();
    const navigate       = useNavigate();
    const { colors, isDark } = useTheme();
    const { favorites, loved, toggleFavorite, toggleLoved } = useUserData();

    const [flippedId, setFlippedId] = useState<string | null>(null);

    const isFavorites = type === 'favorites';
    const activeSet   = isFavorites ? favorites : loved;
    const title       = isFavorites ? 'Favorites' : 'Collections';
    const Icon        = isFavorites ? Heart : Bookmark;

    // Filter the global word list to only words in this folder
    const folderWords = allWords.filter((w) => activeSet.has(w.id));

    const accentColor = isDark ? '#7ec8a9' : '#5aab8b';
    const btnBg       = isDark ? 'bg-[#2a2a2a]' : 'bg-white shadow-sm';

    const handleToggle = async (wordId: string) => {
        if (isFavorites) await toggleFavorite(wordId);
        else             await toggleLoved(wordId);
    };

    return (
        <div className={`flex flex-col h-full ${colors.bg}`}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-12 pb-4">
                <button onClick={() => navigate(-1)} className={colors.textMuted}>
                    <ArrowLeft size={22} />
                </button>
                <div className="flex items-center gap-2 flex-1">
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${accentColor}25` }}
                    >
                        <Icon size={16} style={{ color: accentColor }} />
                    </div>
                    <h2 className={`${colors.text} text-lg`}>{title}</h2>
                </div>
                <span className={`${colors.textDimmed} text-sm`}>{folderWords.length} words</span>
            </div>

            {/* Empty state */}
            {folderWords.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                    <div
                        className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-5 ${isDark ? 'bg-[#2a2a2a]' : 'bg-[#f0ebe3]'}`}
                    >
                        <Icon size={36} className={colors.textDimmed} />
                    </div>
                    <h3 className={`${colors.text} text-lg mb-2`}>No words yet</h3>
                    <p className={`${colors.textMuted} text-sm`}>
                        {isFavorites
                            ? 'Tap the ♥ on any flashcard to add it here.'
                            : 'Tap the bookmark on any flashcard to add it here.'}
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-6 px-6 py-2.5 rounded-2xl text-white text-sm"
                        style={{ backgroundColor: accentColor }}
                    >
                        Go to Flashcards
                    </button>
                </div>
            )}

            {/* Word cards */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
                <AnimatePresence>
                    {folderWords.map((word, i) => {
                        const isFlipped = flippedId === word.id;
                        return (
                            <motion.div
                                key={word.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: i * 0.04 }}
                                className={`${colors.card} rounded-2xl overflow-hidden ${!isDark ? 'shadow-sm' : ''}`}
                            >
                                {/* Tappable card body */}
                                <button
                                    className="w-full p-4 text-left"
                                    onClick={() => setFlippedId(isFlipped ? null : word.id)}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                        <span
                            className="text-lg font-semibold"
                            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                        >
                          <span className={colors.text}>{word.word}</span>
                        </span>
                                                <span className={`${colors.textDimmed} text-xs`}>{word.phonetic}</span>
                                            </div>
                                            <span
                                                className={`text-[11px] uppercase tracking-widest ${isDark ? 'text-[#555]' : 'text-[#aaa]'}`}
                                            >
                        {word.partOfSpeech}
                      </span>
                                        </div>
                                        <Volume2 size={15} className={colors.textDimmed} />
                                    </div>

                                    {/* Flip section */}
                                    <AnimatePresence>
                                        {isFlipped && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className={`mt-3 pt-3 border-t ${colors.border}`}>
                                                    <p className={`${colors.textSecondary} text-sm mb-2`}>{word.definition}</p>
                                                    <p className={`${isDark ? 'text-[#555]' : 'text-[#999]'} text-xs italic`}>
                                                        "{word.example}"
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </button>

                                {/* Action row */}
                                <div className={`flex items-center justify-between px-4 pb-3`}>
                  <span className={`${colors.textDimmed} text-[11px]`}>
                    {isFlipped ? 'tap to hide' : 'tap to see definition'}
                  </span>
                                    {/* Remove from folder */}
                                    <button
                                        onClick={() => handleToggle(word.id)}
                                        className={`p-1.5 rounded-lg ${btnBg} transition-colors`}
                                    >
                                        <Icon
                                            size={14}
                                            style={isFavorites
                                                ? { color: '#f87171', fill: '#f87171' }
                                                : { color: accentColor, fill: accentColor }}
                                        />
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}