/**
 * YourWordsScreen.tsx
 *
 * View A — Folder list: create, delete folders
 * View B — Folder detail: add word, import CSV, delete word, Test button
 */

import { useState, useRef } from "react";
import {
  ArrowLeft, Plus, Trash2, PenLine, FolderOpen,
  ChevronRight, AlertCircle, Upload, Zap,
} from "lucide-react";
import { useNavigate }    from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useTheme }       from "./ThemeContext";
import { useUserData }    from "../contexts/UserDataContext";
import { parseCSV }       from "../services/userDataService";
import type { CustomFolder } from "../services/userDataService";

type View = "folders" | "detail";

export function YourWordsScreen() {
  const navigate           = useNavigate();
  const { colors, isDark } = useTheme();
  const {
    customFolders, addFolder, deleteFolder,
    addWordToFolder, deleteWordFromFolder, importCSVToFolder,
    storageUsageLabel, storageUsagePercent,
  } = useUserData();

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [view,           setView]           = useState<View>("folders");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // ── Folder form ────────────────────────────────────────────────────────────
  const [showNewFolder,  setShowNewFolder]  = useState(false);
  const [newFolderName,  setNewFolderName]  = useState("");

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);

  // ── Word form ──────────────────────────────────────────────────────────────
  const [showWordForm,   setShowWordForm]   = useState(false);
  const [newWord,        setNewWord]        = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [newNotes,       setNewNotes]       = useState("");

  // ── CSV ────────────────────────────────────────────────────────────────────
  const [csvStatus,      setCsvStatus]      = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Limit toast ────────────────────────────────────────────────────────────
  const [limitWarning,   setLimitWarning]   = useState<string | null>(null);

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";
  const cardBg      = isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm";
  const inputBorder = isDark ? "border-[#333]" : "border-[#e8e3db]";

  const activeFolder = customFolders.find((f) => f.id === activeFolderId) ?? null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const showLimit = (isPaid: boolean) => {
    setLimitWarning(isPaid ? "250 MB limit reached." : "50 MB free limit reached. Upgrade for 250 MB.");
    setTimeout(() => setLimitWarning(null), 4000);
  };

  const openFolder = (folder: CustomFolder) => {
    setActiveFolderId(folder.id);
    setView("detail");
    setShowWordForm(false);
    setCsvStatus(null);
  };

  const goBack = () => {
    setView("folders");
    setActiveFolderId(null);
    setShowWordForm(false);
    setCsvStatus(null);
  };

  // ── Folder CRUD ────────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const r = await addFolder(newFolderName.trim());
    if (r && !r.ok) showLimit(r.isPaidLimit);
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const r = await deleteFolder(folderId);
    if (r && !r.ok) showLimit(r.isPaidLimit);
    setDeletingFolder(null);
    if (activeFolderId === folderId) goBack();
  };

  // ── Word CRUD ──────────────────────────────────────────────────────────────

  const handleAddWord = async () => {
    if (!activeFolderId || !newWord.trim() || !newTranslation.trim()) return;
    const r = await addWordToFolder(activeFolderId, {
      id:          `w-${Date.now()}`,
      word:        newWord.trim(),
      translation: newTranslation.trim(),
      notes:       newNotes.trim() || undefined,
    });
    if (r && !r.ok) { showLimit(r.isPaidLimit); return; }
    setNewWord(""); setNewTranslation(""); setNewNotes("");
    setShowWordForm(false);
  };

  const handleDeleteWord = async (wordId: string) => {
    if (!activeFolderId) return;
    const r = await deleteWordFromFolder(activeFolderId, wordId);
    if (r && !r.ok) showLimit(r.isPaidLimit);
  };

  // ── CSV ────────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeFolderId) return;
    if (!file.name.endsWith(".csv")) { setCsvStatus("❌ Please upload a .csv file"); return; }
    setCsvStatus("Parsing…");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw  = ev.target?.result as string;
      const rows = parseCSV(raw);
      if (rows.length === 0) { setCsvStatus("❌ No valid rows found. Format: word,translation,notes"); return; }
      const r = await importCSVToFolder(activeFolderId, rows);
      if (r === null)   setCsvStatus(`✅ ${rows.length} words imported`);
      else if (r.ok)    setCsvStatus(`✅ ${r.imported} words imported`);
      else              showLimit(r.isPaidLimit);
      setTimeout(() => setCsvStatus(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Test handler ───────────────────────────────────────────────────────────

  const handleTest = () => {
    if (!activeFolder || activeFolder.words.length < 2) return;
    navigate("/practice", {
      state: {
        folderName:  activeFolder.name,
        folderWords: activeFolder.words.map((w) => ({
          id:          w.id,
          word:        w.word,
          translation: w.translation,
        })),
      },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
      <div className={`flex flex-col h-full ${colors.bg}`}>

        {/* Limit toast */}
        <AnimatePresence>
          {limitWarning && (
              <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-4 left-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#c9a96e]/90 text-white text-sm shadow-lg"
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{limitWarning}</span>
              </motion.div>
          )}
        </AnimatePresence>

        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* VIEW A — Folder list                                               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {view === "folders" && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-12 pb-4">
                <button onClick={() => navigate(-1)} className={colors.textMuted}>
                  <ArrowLeft size={22} />
                </button>
                <h2 className={`${colors.text} text-lg`}>Your own words</h2>
                <button
                    onClick={() => setShowNewFolder(true)}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${accentColor}20` }}
                >
                  <Plus size={18} style={{ color: accentColor }} />
                </button>
              </div>

              {/* Storage bar */}
              <div className="px-5 mb-4">
                <div className="flex justify-between mb-1">
                  <span className={`${colors.textDimmed} text-[11px]`}>Storage</span>
                  <span className={`${colors.textDimmed} text-[11px]`}>{storageUsageLabel}</span>
                </div>
                <div className={`h-1 rounded-full ${isDark ? "bg-[#2a2a2a]" : "bg-[#e8e3db]"}`}>
                  <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${storageUsagePercent}%`,
                        backgroundColor: storageUsagePercent > 85 ? "#f87171" : accentColor,
                      }}
                  />
                </div>
              </div>

              {/* New folder form */}
              <AnimatePresence>
                {showNewFolder && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-5 mb-3"
                    >
                      <div className={`${cardBg} rounded-2xl p-4`}>
                        <p className={`${colors.textSecondary} text-sm mb-3`}>New folder</p>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Folder name…"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                            className={`w-full bg-transparent outline-none text-sm mb-4 pb-3 border-b ${inputBorder}`}
                            style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
                        />
                        <div className="flex gap-2">
                          <button
                              onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
                              className={`flex-1 py-2.5 rounded-xl text-sm border ${colors.border} ${colors.textSecondary}`}
                          >
                            Cancel
                          </button>
                          <button
                              onClick={handleCreateFolder}
                              disabled={!newFolderName.trim()}
                              className="flex-1 py-2.5 rounded-xl text-sm text-white disabled:opacity-40"
                              style={{ backgroundColor: accentColor }}
                          >
                            Create
                          </button>
                        </div>
                      </div>
                    </motion.div>
                )}
              </AnimatePresence>

              {/* Folder list */}
              <div className="flex-1 overflow-y-auto px-5 pb-6">
                {customFolders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-8">
                      <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 ${isDark ? "bg-[#2a2a2a]" : "bg-[#f0ebe3]"}`}>
                        <PenLine size={40} className={colors.textDimmed} />
                      </div>
                      <h3 className={`${colors.text} text-xl mb-2`}>No folders yet</h3>
                      <p className={`${colors.textMuted} text-sm mb-8`}>
                        Create a folder to organise your own words. Import words from a CSV file.
                      </p>
                      <button
                          onClick={() => setShowNewFolder(true)}
                          className="px-8 py-3.5 rounded-2xl text-white text-sm font-medium"
                          style={{ backgroundColor: accentColor }}
                      >
                        Create first folder
                      </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {customFolders.map((folder) => (
                          <motion.div
                              key={folder.id}
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              className={`${cardBg} rounded-2xl overflow-hidden`}
                          >
                            {deletingFolder === folder.id ? (
                                <div className="flex items-center justify-between px-4 py-3.5">
                                  <span className={`${colors.textSecondary} text-sm`}>Delete "{folder.name}"?</span>
                                  <div className="flex gap-2">
                                    <button
                                        onClick={() => setDeletingFolder(null)}
                                        className={`px-3 py-1.5 rounded-lg text-xs border ${colors.border} ${colors.textSecondary}`}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                        onClick={() => handleDeleteFolder(folder.id)}
                                        className="px-3 py-1.5 rounded-lg text-xs text-white bg-red-500"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                            ) : (
                                <div className="flex items-center">
                                  <button className="flex items-center gap-3 flex-1 px-4 py-3.5 text-left" onClick={() => openFolder(folder)}>
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accentColor}20` }}>
                                      <FolderOpen size={18} style={{ color: accentColor }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`${colors.text} text-sm truncate`}>{folder.name}</p>
                                      <p className={`${colors.textDimmed} text-[11px]`}>{folder.words.length} words</p>
                                    </div>
                                    <ChevronRight size={16} className={colors.textDimmed} />
                                  </button>
                                  <button onClick={() => setDeletingFolder(folder.id)} className="pr-4 pl-1 py-3.5">
                                    <Trash2 size={16} className="text-red-400" />
                                  </button>
                                </div>
                            )}
                          </motion.div>
                      ))}
                    </div>
                )}
              </div>
            </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* VIEW B — Folder detail                                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {view === "detail" && activeFolder && (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-5 pt-12 pb-4">
                <button onClick={goBack} className={colors.textMuted}>
                  <ArrowLeft size={22} />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FolderOpen size={18} style={{ color: accentColor }} />
                  <h2 className={`${colors.text} text-lg truncate`}>{activeFolder.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm"}`}
                      title="Import CSV"
                  >
                    <Upload size={16} className={colors.textMuted} />
                  </button>
                  <button
                      onClick={() => setShowWordForm(true)}
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${accentColor}20` }}
                  >
                    <Plus size={18} style={{ color: accentColor }} />
                  </button>
                </div>
              </div>

              {/* Test button */}
              {activeFolder.words.length >= 2 && (
                  <div className="px-5 mb-3">
                    <button
                        onClick={handleTest}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-medium shadow-md active:scale-[0.98] transition-transform"
                        style={{ backgroundColor: accentColor }}
                    >
                      <Zap size={16} className="text-white" />
                      Test myself on "{activeFolder.name}"
                    </button>
                  </div>
              )}

              {/* CSV status */}
              <AnimatePresence>
                {csvStatus && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mx-5 mb-3 px-4 py-2.5 rounded-xl text-sm"
                        style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                    >
                      {csvStatus}
                    </motion.div>
                )}
              </AnimatePresence>

              {/* CSV format hint */}
              <div className={`mx-5 mb-3 px-4 py-2 rounded-xl ${isDark ? "bg-[#1e2a22]" : "bg-[#e8f5ee]"}`}>
                <p className={`text-[11px] ${isDark ? "text-[#5a8a6a]" : "text-[#4a7a5a]"}`}>
                  CSV format: <span className="font-mono">word,translation,notes</span> — first row is header
                </p>
              </div>

              {/* Add word form */}
              <AnimatePresence>
                {showWordForm && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-5 mb-3"
                    >
                      <div className={`${cardBg} rounded-2xl p-4`}>
                        <p className={`${colors.textSecondary} text-sm mb-3`}>Add word</p>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Word or phrase"
                            value={newWord}
                            onChange={(e) => setNewWord(e.target.value)}
                            className={`w-full bg-transparent outline-none text-sm mb-3 pb-3 border-b ${inputBorder}`}
                            style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
                        />
                        <input
                            type="text"
                            placeholder="Translation"
                            value={newTranslation}
                            onChange={(e) => setNewTranslation(e.target.value)}
                            className={`w-full bg-transparent outline-none text-sm mb-3 pb-3 border-b ${inputBorder}`}
                            style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
                        />
                        <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={newNotes}
                            onChange={(e) => setNewNotes(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddWord()}
                            className="w-full bg-transparent outline-none text-sm mb-4"
                            style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
                        />
                        <div className="flex gap-2">
                          <button
                              onClick={() => { setShowWordForm(false); setNewWord(""); setNewTranslation(""); setNewNotes(""); }}
                              className={`flex-1 py-2.5 rounded-xl text-sm border ${colors.border} ${colors.textSecondary}`}
                          >
                            Cancel
                          </button>
                          <button
                              onClick={handleAddWord}
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

              {/* Word list */}
              <div className="flex-1 overflow-y-auto px-5 pb-6">
                {activeFolder.words.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-8">
                      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-5 ${isDark ? "bg-[#2a2a2a]" : "bg-[#f0ebe3]"}`}>
                        <Upload size={36} className={colors.textDimmed} />
                      </div>
                      <h3 className={`${colors.text} text-lg mb-2`}>Empty folder</h3>
                      <p className={`${colors.textMuted} text-sm`}>Add words manually or import a CSV file.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <AnimatePresence>
                        {activeFolder.words.map((w) => (
                            <motion.div
                                key={w.id}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                className={`${cardBg} rounded-2xl p-4 flex items-center justify-between gap-3`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`${colors.text} text-sm font-medium truncate`}>{w.word}</p>
                                  {w.fromCSV && (
                                      <span
                                          className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
                                      >
                              CSV
                            </span>
                                  )}
                                </div>
                                <p className={`${colors.textMuted} text-xs`}>{w.translation}</p>
                                {w.notes && (
                                    <p className={`${colors.textDimmed} text-[11px] italic mt-0.5`}>{w.notes}</p>
                                )}
                              </div>
                              <button
                                  onClick={() => handleDeleteWord(w.id)}
                                  className="p-2 rounded-lg text-red-400 active:bg-red-400/10 flex-shrink-0"
                              >
                                <Trash2 size={16} />
                              </button>
                            </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                )}
              </div>
            </>
        )}
      </div>
  );
}