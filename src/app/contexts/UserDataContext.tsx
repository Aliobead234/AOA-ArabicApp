/**
 * UserDataContext.tsx
 *
 * Global context for all persisted user word data:
 *   • favorites / loved    — hearted/bookmarked flashcard IDs
 *   • addedWords           — words saved from AI chat
 *   • customFolders        — user-created folders with custom words
 *
 * Guest users get local-only state (no Supabase writes).
 * All mutations are serialised through a write queue to prevent race conditions.
 */

import {
    createContext, useContext, useEffect, useState, useMemo,
    useCallback, useRef, type ReactNode,
} from 'react';
import { useAuth }     from './AuthContext';
import { usePurchase } from './PurchaseContext';
import * as svc from '../services/userDataService';
import type {
    AddedWord, CustomFolder, CustomWord,
    UserWordData, WriteResult,
} from '../services/userDataService';

// ── Context shape ──────────────────────────────────────────────────────────────

interface UserDataContextValue {
    // Flashcard sets
    favorites:  Set<string>;
    loved:      Set<string>;
    // AI chat words
    addedWords: AddedWord[];
    // Custom folders
    customFolders: CustomFolder[];

    // Storage metadata
    dataSizeB:           number;
    storageUsagePercent: number;
    storageUsageLabel:   string;

    loading: boolean;

    // Flashcard toggles
    toggleFavorite: (wordId: string) => Promise<WriteResult | null>;
    toggleLoved:    (wordId: string) => Promise<WriteResult | null>;

    // AI-chat word ops
    addWord:        (word: Omit<AddedWord, 'savedAt'>)  => Promise<WriteResult | null>;
    removeAddedWord:(wordId: string)                    => Promise<WriteResult | null>;

    // Folder ops
    addFolder:         (name: string)                                              => Promise<(WriteResult & { folderId?: string }) | null>;
    deleteFolder:      (folderId: string)                                          => Promise<WriteResult | null>;
    renameFolder:      (folderId: string, newName: string)                         => Promise<WriteResult | null>;
    addWordToFolder:   (folderId: string, word: Omit<CustomWord, 'addedAt'>)       => Promise<WriteResult | null>;
    deleteWordFromFolder: (folderId: string, wordId: string)                       => Promise<WriteResult | null>;
    importCSVToFolder: (folderId: string, csvWords: Omit<CustomWord, 'addedAt'>[]) => Promise<(WriteResult & { imported: number }) | null>;
}

// ── Context ────────────────────────────────────────────────────────────────────

const UserDataContext = createContext<UserDataContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function UserDataProvider({ children }: { children: ReactNode }) {
    const { user, guestMode } = useAuth();
    const { hasPurchased }    = usePurchase();

    const [data, setData] = useState<UserWordData>({
        favorites: [], loved: [], addedWords: [], customFolders: [], dataSizeB: 0,
    });
    const [loading, setLoading] = useState(false);

    // Serialise async writes to prevent concurrent DB updates
    const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

    // ── Load on sign-in ────────────────────────────────────────────────────────

    useEffect(() => {
        if (!user || guestMode) {
            setData({ favorites: [], loved: [], addedWords: [], customFolders: [], dataSizeB: 0 });
            return;
        }
        let cancelled = false;
        setLoading(true);
        svc.loadUserWordData(user.id)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e) => console.error('[UserDataContext] load:', e))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user?.id, guestMode]);

    // ── Write queue helper ─────────────────────────────────────────────────────

    const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
        const next = writeQueue.current.then(fn).catch((e) => {
            console.error('[UserDataContext] write error:', e);
            throw e;
        });
        writeQueue.current = next.catch(() => {});
        return next;
    }, []);

    // ── Flashcard: favorites ───────────────────────────────────────────────────

    const toggleFavorite = useCallback(async (wordId: string) => {
        // Optimistic — toggle UI immediately
        setData((p) => { const s = new Set(p.favorites); s.has(wordId) ? s.delete(wordId) : s.add(wordId); return { ...p, favorites: [...s] }; });
        if (!user || guestMode) return null;
        return enqueue(async () => {
            const r = await svc.toggleFavorite(user.id, wordId, hasPurchased);
            if (r.ok) {
                setData((p) => ({ ...p, dataSizeB: r.dataSizeB }));
            } else {
                // Rollback
                setData((p) => { const s = new Set(p.favorites); s.has(wordId) ? s.delete(wordId) : s.add(wordId); return { ...p, favorites: [...s] }; });
            }
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    // ── Flashcard: loved ───────────────────────────────────────────────────────

    const toggleLoved = useCallback(async (wordId: string) => {
        // Optimistic — toggle UI immediately
        setData((p) => { const s = new Set(p.loved); s.has(wordId) ? s.delete(wordId) : s.add(wordId); return { ...p, loved: [...s] }; });
        if (!user || guestMode) return null;
        return enqueue(async () => {
            const r = await svc.toggleLoved(user.id, wordId, hasPurchased);
            if (r.ok) {
                setData((p) => ({ ...p, dataSizeB: r.dataSizeB }));
            } else {
                // Rollback
                setData((p) => { const s = new Set(p.loved); s.has(wordId) ? s.delete(wordId) : s.add(wordId); return { ...p, loved: [...s] }; });
            }
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    // ── AI words ───────────────────────────────────────────────────────────────

    const addWord = useCallback(async (word: Omit<AddedWord, 'savedAt'>) => {
        if (!user || guestMode) {
            setData((p) => {
                if (p.addedWords.some((w) => w.id === word.id)) return p;
                return { ...p, addedWords: [...p.addedWords, { ...word, savedAt: new Date().toISOString() }] };
            });
            return null;
        }
        return enqueue(async () => {
            const r = await svc.addWord(user.id, word, hasPurchased);
            if (r.ok) setData((p) => {
                if (p.addedWords.some((w) => w.id === word.id)) return p;
                return { ...p, addedWords: [...p.addedWords, { ...word, savedAt: new Date().toISOString() }], dataSizeB: r.dataSizeB };
            });
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    const removeAddedWord = useCallback(async (wordId: string) => {
        if (!user || guestMode) {
            setData((p) => ({ ...p, addedWords: p.addedWords.filter((w) => w.id !== wordId) }));
            return null;
        }
        return enqueue(async () => {
            const r = await svc.removeAddedWord(user.id, wordId, hasPurchased);
            if (r.ok) setData((p) => ({ ...p, addedWords: p.addedWords.filter((w) => w.id !== wordId), dataSizeB: r.dataSizeB }));
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    // ── Folder operations ──────────────────────────────────────────────────────

    const addFolder = useCallback(async (name: string) => {
        const tempId = `folder-${Date.now()}`;
        const newFolder: CustomFolder = { id: tempId, name, createdAt: new Date().toISOString(), words: [] };

        if (!user || guestMode) {
            setData((p) => ({ ...p, customFolders: [...p.customFolders, newFolder] }));
            return null;
        }
        return enqueue(async () => {
            const r = await svc.addFolder(user.id, name, hasPurchased);
            if (r.ok) setData((p) => ({ ...p, customFolders: [...p.customFolders, { ...newFolder, id: r.folderId ?? tempId }], dataSizeB: r.dataSizeB }));
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    const deleteFolder = useCallback(async (folderId: string) => {
        if (!user || guestMode) {
            setData((p) => ({ ...p, customFolders: p.customFolders.filter((f) => f.id !== folderId) }));
            return null;
        }
        return enqueue(async () => {
            const r = await svc.deleteFolder(user.id, folderId, hasPurchased);
            if (r.ok) setData((p) => ({ ...p, customFolders: p.customFolders.filter((f) => f.id !== folderId), dataSizeB: r.dataSizeB }));
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    const renameFolder = useCallback(async (folderId: string, newName: string) => {
        if (!user || guestMode) {
            setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, name: newName } : f) }));
            return null;
        }
        return enqueue(async () => {
            const r = await svc.renameFolder(user.id, folderId, newName, hasPurchased);
            if (r.ok) setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, name: newName } : f), dataSizeB: r.dataSizeB }));
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    const addWordToFolder = useCallback(async (folderId: string, word: Omit<CustomWord, 'addedAt'>) => {
        const newWord: CustomWord = { ...word, addedAt: new Date().toISOString() };
        if (!user || guestMode) {
            setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, words: [...f.words, newWord] } : f) }));
            return null;
        }
        return enqueue(async () => {
            const r = await svc.addWordToFolder(user.id, folderId, word, hasPurchased);
            if (r.ok) setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, words: [...f.words, newWord] } : f), dataSizeB: r.dataSizeB }));
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    const deleteWordFromFolder = useCallback(async (folderId: string, wordId: string) => {
        if (!user || guestMode) {
            setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, words: f.words.filter((w) => w.id !== wordId) } : f) }));
            return null;
        }
        return enqueue(async () => {
            const r = await svc.deleteWordFromFolder(user.id, folderId, wordId, hasPurchased);
            if (r.ok) setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, words: f.words.filter((w) => w.id !== wordId) } : f), dataSizeB: r.dataSizeB }));
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    const importCSVToFolder = useCallback(async (folderId: string, csvWords: Omit<CustomWord, 'addedAt'>[]) => {
        const stamped = csvWords.map((w): CustomWord => ({ ...w, addedAt: new Date().toISOString(), fromCSV: true }));
        if (!user || guestMode) {
            setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, words: [...f.words, ...stamped] } : f) }));
            return null;
        }
        return enqueue(async () => {
            const r = await svc.importCSVToFolder(user.id, folderId, csvWords, hasPurchased);
            if (r.ok) setData((p) => ({ ...p, customFolders: p.customFolders.map((f) => f.id === folderId ? { ...f, words: [...f.words, ...stamped] } : f), dataSizeB: r.dataSizeB }));
            return r;
        });
    }, [user, guestMode, hasPurchased, enqueue]);

    // ── Derived ────────────────────────────────────────────────────────────────

    const favoritesSet = useMemo(() => new Set(data.favorites), [data.favorites]);
    const lovedSet     = useMemo(() => new Set(data.loved),     [data.loved]);

    return (
        <UserDataContext.Provider value={{
            favorites:           favoritesSet,
            loved:               lovedSet,
            addedWords:          data.addedWords,
            customFolders:       data.customFolders,
            dataSizeB:           data.dataSizeB,
            storageUsagePercent: svc.storageUsagePercent(data.dataSizeB, hasPurchased),
            storageUsageLabel:   svc.formatStorageUsage(data.dataSizeB, hasPurchased),
            loading,
            toggleFavorite, toggleLoved,
            addWord, removeAddedWord,
            addFolder, deleteFolder, renameFolder,
            addWordToFolder, deleteWordFromFolder, importCSVToFolder,
        }}>
            {children}
        </UserDataContext.Provider>
    );
}

export function useUserData() {
    const ctx = useContext(UserDataContext);
    if (!ctx) throw new Error('useUserData must be used within UserDataProvider');
    return ctx;
}