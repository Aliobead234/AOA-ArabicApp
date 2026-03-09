/**
 * userDataService.ts
 *
 * Manages per-user word data in Supabase:
 *   • favorites     — hearted flashcard word IDs
 *   • loved         — bookmarked flashcard word IDs
 *   • addedWords    — words saved from AI chat
 *   • customFolders — user-created folders with custom words + CSV imports
 *
 * Storage limits (enforced before every write):
 *   • Free plan  → 50 MB
 *   • Paid plan  → 250 MB
 */

import { supabase } from './supabase';

// ── Constants ──────────────────────────────────────────────────────────────────

export const FREE_LIMIT_BYTES = 50 * 1024 * 1024;   // 50 MB
export const PAID_LIMIT_BYTES = 250 * 1024 * 1024;  // 250 MB

const TABLE = 'user_word_data';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AddedWord {
    id: string;
    arabic: string;
    transliteration: string;
    english: string;
    savedAt: string;
}

export interface CustomWord {
    id: string;
    word: string;
    translation: string;
    notes?: string;
    addedAt: string;
    fromCSV?: boolean;
}

export interface CustomFolder {
    id: string;
    name: string;
    createdAt: string;
    words: CustomWord[];
}

export interface UserWordData {
    favorites:     string[];
    loved:         string[];
    addedWords:    AddedWord[];
    customFolders: CustomFolder[];
    dataSizeB:     number;
}

export interface SaveResult {
    ok: true;
    dataSizeB: number;
}

export interface LimitResult {
    ok: false;
    reason: 'storage_limit_exceeded';
    dataSizeB: number;
    limitBytes: number;
    isPaidLimit: boolean;
}

export type WriteResult = SaveResult | LimitResult;

// ── Internals ──────────────────────────────────────────────────────────────────

function measureBytes(data: Omit<UserWordData, 'dataSizeB'>): number {
    return new TextEncoder().encode(JSON.stringify({
        favorites:      data.favorites,
        loved:          data.loved,
        added_words:    data.addedWords,
        custom_folders: data.customFolders,
    })).length;
}

function rowToData(row: Record<string, unknown>): UserWordData {
    return {
        favorites:     (row.favorites      as string[])       ?? [],
        loved:         (row.loved          as string[])       ?? [],
        addedWords:    (row.added_words    as AddedWord[])    ?? [],
        customFolders: (row.custom_folders as CustomFolder[]) ?? [],
        dataSizeB:     (row.data_size_b    as number)         ?? 0,
    };
}

// ── Core load / save ───────────────────────────────────────────────────────────

export async function loadUserWordData(userId: string): Promise<UserWordData> {
    const { data, error } = await supabase
        .from(TABLE)
        .select('favorites, loved, added_words, custom_folders, data_size_b')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw new Error(`[userDataService] load: ${error.message}`);
    if (!data)  return { favorites: [], loved: [], addedWords: [], customFolders: [], dataSizeB: 0 };
    return rowToData(data);
}

export async function saveUserWordData(
    userId: string,
    data: Omit<UserWordData, 'dataSizeB'>,
    hasPurchased: boolean,
): Promise<WriteResult> {
    const sizeB      = measureBytes(data);
    const limitBytes = hasPurchased ? PAID_LIMIT_BYTES : FREE_LIMIT_BYTES;

    if (sizeB > limitBytes) {
        return { ok: false, reason: 'storage_limit_exceeded', dataSizeB: sizeB, limitBytes, isPaidLimit: hasPurchased };
    }

    const { error } = await supabase.from(TABLE).upsert(
        { user_id: userId, favorites: data.favorites, loved: data.loved,
            added_words: data.addedWords, custom_folders: data.customFolders, data_size_b: sizeB },
        { onConflict: 'user_id' },
    );

    if (error) throw new Error(`[userDataService] save: ${error.message}`);
    return { ok: true, dataSizeB: sizeB };
}

// ── Favorites / Loved / AddedWords ─────────────────────────────────────────────

export async function toggleFavorite(userId: string, wordId: string, hasPurchased: boolean): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    const s = new Set(c.favorites);
    s.has(wordId) ? s.delete(wordId) : s.add(wordId);
    return saveUserWordData(userId, { ...c, favorites: [...s] }, hasPurchased);
}

export async function toggleLoved(userId: string, wordId: string, hasPurchased: boolean): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    const s = new Set(c.loved);
    s.has(wordId) ? s.delete(wordId) : s.add(wordId);
    return saveUserWordData(userId, { ...c, loved: [...s] }, hasPurchased);
}

export async function addWord(userId: string, word: Omit<AddedWord, 'savedAt'>, hasPurchased: boolean): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    if (c.addedWords.some((w) => w.id === word.id)) return { ok: true, dataSizeB: c.dataSizeB };
    return saveUserWordData(userId, { ...c, addedWords: [...c.addedWords, { ...word, savedAt: new Date().toISOString() }] }, hasPurchased);
}

export async function removeAddedWord(userId: string, wordId: string, hasPurchased: boolean): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    return saveUserWordData(userId, { ...c, addedWords: c.addedWords.filter((w) => w.id !== wordId) }, hasPurchased);
}

// ── Folder operations ─────────────────────────────────────────────────────────

export async function addFolder(userId: string, name: string, hasPurchased: boolean): Promise<WriteResult & { folderId?: string }> {
    const c        = await loadUserWordData(userId);
    const folderId = `folder-${Date.now()}`;
    const folder: CustomFolder = { id: folderId, name: name.trim(), createdAt: new Date().toISOString(), words: [] };
    const result   = await saveUserWordData(userId, { ...c, customFolders: [...c.customFolders, folder] }, hasPurchased);
    return result.ok ? { ...result, folderId } : result;
}

export async function deleteFolder(userId: string, folderId: string, hasPurchased: boolean): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    return saveUserWordData(userId, { ...c, customFolders: c.customFolders.filter((f) => f.id !== folderId) }, hasPurchased);
}

export async function renameFolder(userId: string, folderId: string, newName: string, hasPurchased: boolean): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    return saveUserWordData(userId, {
        ...c,
        customFolders: c.customFolders.map((f) => f.id === folderId ? { ...f, name: newName.trim() } : f),
    }, hasPurchased);
}

export async function addWordToFolder(
    userId: string,
    folderId: string,
    word: Omit<CustomWord, 'addedAt'>,
    hasPurchased: boolean,
): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    const folder = c.customFolders.find((f) => f.id === folderId);
    if (!folder) throw new Error(`[userDataService] folder ${folderId} not found`);
    if (folder.words.some((w) => w.id === word.id)) return { ok: true, dataSizeB: c.dataSizeB };

    return saveUserWordData(userId, {
        ...c,
        customFolders: c.customFolders.map((f) =>
            f.id === folderId ? { ...f, words: [...f.words, { ...word, addedAt: new Date().toISOString() }] } : f,
        ),
    }, hasPurchased);
}

export async function deleteWordFromFolder(
    userId: string,
    folderId: string,
    wordId: string,
    hasPurchased: boolean,
): Promise<WriteResult> {
    const c = await loadUserWordData(userId);
    return saveUserWordData(userId, {
        ...c,
        customFolders: c.customFolders.map((f) =>
            f.id === folderId ? { ...f, words: f.words.filter((w) => w.id !== wordId) } : f,
        ),
    }, hasPurchased);
}

/**
 * Bulk-import CSV-parsed words into a folder. Deduplicates by word.id.
 * Returns how many words were actually added.
 */
export async function importCSVToFolder(
    userId: string,
    folderId: string,
    csvWords: Omit<CustomWord, 'addedAt'>[],
    hasPurchased: boolean,
): Promise<WriteResult & { imported: number }> {
    const c      = await loadUserWordData(userId);
    const folder = c.customFolders.find((f) => f.id === folderId);
    if (!folder) throw new Error(`[userDataService] folder ${folderId} not found`);

    const existingIds = new Set(folder.words.map((w) => w.id));
    const newWords    = csvWords
        .filter((w) => !existingIds.has(w.id))
        .map((w): CustomWord => ({ ...w, addedAt: new Date().toISOString(), fromCSV: true }));

    const result = await saveUserWordData(userId, {
        ...c,
        customFolders: c.customFolders.map((f) =>
            f.id === folderId ? { ...f, words: [...f.words, ...newWords] } : f,
        ),
    }, hasPurchased);

    return result.ok ? { ...result, imported: newWords.length } : { ...result, imported: 0 };
}

// ── CSV parser ────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into CustomWord objects (minus `addedAt`).
 *
 * Expected formats — first row is always treated as the header and skipped:
 *   word,translation[,notes]
 *
 * Example CSV:
 *   word,translation,notes
 *   مرحبا,hello,greeting
 *   شكراً,thank you
 */
export function parseCSV(raw: string): Omit<CustomWord, 'addedAt'>[] {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Skip header — use reduce so we never produce a (T | null)[] array
    const results: Omit<CustomWord, 'addedAt'>[] = [];
    lines.slice(1).forEach((line, idx) => {
        const cols        = splitCSVLine(line);
        const word        = cols[0]?.trim() ?? '';
        const translation = cols[1]?.trim() ?? '';
        const notesRaw    = cols[2]?.trim();
        if (!word || !translation) return;

        const entry: Omit<CustomWord, 'addedAt'> = {
            id:          `csv-${Date.now()}-${idx}`,
            word,
            translation,
            fromCSV:     true,
            ...(notesRaw ? { notes: notesRaw } : {}),
        };
        results.push(entry);
    });
    return results;
}

function splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current  = '';
    let inQuotes = false;

    for (const ch of line) {
        if (ch === '"')               inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
        else                          current += ch;
    }
    result.push(current);
    return result;
}

// ── Storage display helpers ───────────────────────────────────────────────────

export function formatStorageUsage(dataSizeB: number, hasPurchased: boolean): string {
    const limit = hasPurchased ? PAID_LIMIT_BYTES : FREE_LIMIT_BYTES;
    return `${(dataSizeB / 1048576).toFixed(2)} MB / ${(limit / 1048576).toFixed(0)} MB`;
}

export function storageUsagePercent(dataSizeB: number, hasPurchased: boolean): number {
    const limit = hasPurchased ? PAID_LIMIT_BYTES : FREE_LIMIT_BYTES;
    return Math.min(100, Math.round((dataSizeB / limit) * 100));
}