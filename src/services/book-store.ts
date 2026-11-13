/**
 * Per-book sidecar store.
 *
 * Each book folder (a SAF directory URI) contains a `lumen.json` file that
 * holds progress and bookmarks for that book.  Because SAF URIs are opaque
 * content:// addresses, SQLite cannot open files inside them directly.
 * Instead we read/write the JSON via expo-file-system's SAF helpers.
 *
 * File layout inside a book folder:
 *   lumen.json  →  { version, progress, bookmarks }
 */

import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system/legacy';

const SIDECAR_FILENAME = 'lumen.json';
const SIDECAR_MIME = 'application/json';
const SIDECAR_VERSION = 1;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BookProgress {
  chapter_id: string;
  position_ms: number;
  updated_at: number;
  finished: number; // 0 | 1
}

export interface BookBookmark {
  id: string;
  chapter_id: string;
  position_ms: number;
  note: string | null;
  created_at: number;
}

interface Sidecar {
  version: number;
  progress: BookProgress | null;
  bookmarks: BookBookmark[];
}

// ─── In-memory URI cache ──────────────────────────────────────────────────────
// Maps bookFolderUri → SAF URI of the lumen.json inside it.
// Avoids re-listing the directory every read/write.

const sidecarUriCache = new Map<string, string>();

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Find an existing lumen.json inside a SAF directory, or create one.
 * Returns the SAF URI of the sidecar file, or null on failure.
 */
async function getSidecarUri(bookFolderUri: string): Promise<string | null> {
  const cached = sidecarUriCache.get(bookFolderUri);
  if (cached) return cached;

  try {
    // List directory to find existing sidecar
    const contents = await StorageAccessFramework.readDirectoryAsync(bookFolderUri);
    for (const fileUri of contents) {
      const decoded = decodeURIComponent(fileUri);
      const name = decoded.substring(decoded.lastIndexOf('/') + 1);
      const cleanName = name.includes(':') ? name.substring(name.lastIndexOf(':') + 1) : name;
      if (cleanName === SIDECAR_FILENAME) {
        sidecarUriCache.set(bookFolderUri, fileUri);
        return fileUri;
      }
    }

    // Not found — create it with an empty sidecar
    const newUri = await StorageAccessFramework.createFileAsync(
      bookFolderUri,
      SIDECAR_FILENAME,
      SIDECAR_MIME
    );
    const empty: Sidecar = { version: SIDECAR_VERSION, progress: null, bookmarks: [] };
    await FileSystem.writeAsStringAsync(newUri, JSON.stringify(empty), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    sidecarUriCache.set(bookFolderUri, newUri);
    return newUri;
  } catch (err) {
    console.warn('[book-store] getSidecarUri failed for', bookFolderUri, err);
    return null;
  }
}

/** Read and parse the sidecar. Returns a default empty sidecar on any error. */
async function readSidecar(bookFolderUri: string): Promise<Sidecar> {
  const empty: Sidecar = { version: SIDECAR_VERSION, progress: null, bookmarks: [] };
  try {
    const uri = await getSidecarUri(bookFolderUri);
    if (!uri) return empty;

    const text = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!text || text.trim() === '') return empty;
    const parsed = JSON.parse(text) as Partial<Sidecar>;
    return {
      version: parsed.version ?? SIDECAR_VERSION,
      progress: parsed.progress ?? null,
      bookmarks: parsed.bookmarks ?? [],
    };
  } catch (err) {
    console.warn('[book-store] readSidecar failed for', bookFolderUri, err);
    return empty;
  }
}

/** Write the sidecar back to the book folder. */
async function writeSidecar(bookFolderUri: string, data: Sidecar): Promise<void> {
  try {
    const uri = await getSidecarUri(bookFolderUri);
    if (!uri) return;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(data), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('[book-store] writeSidecar failed for', bookFolderUri, err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Read progress for a book. Returns null if no progress has been saved. */
export async function getBookProgress(bookFolderUri: string): Promise<BookProgress | null> {
  const sidecar = await readSidecar(bookFolderUri);
  return sidecar.progress;
}

/** Persist playback progress for a book. */
export async function saveBookProgress(
  bookFolderUri: string,
  chapterId: string,
  positionMs: number,
  finished: boolean = false
): Promise<void> {
  const sidecar = await readSidecar(bookFolderUri);
  sidecar.progress = {
    chapter_id: chapterId,
    position_ms: Math.max(0, Math.floor(positionMs)),
    updated_at: Date.now(),
    finished: finished ? 1 : 0,
  };
  await writeSidecar(bookFolderUri, sidecar);
}

/** Mark book as finished (or unfinished), preserving current chapter/position. */
export async function markBookFinished(
  bookFolderUri: string,
  finished: boolean,
  fallbackChapterId?: string
): Promise<void> {
  const sidecar = await readSidecar(bookFolderUri);
  if (sidecar.progress) {
    sidecar.progress.finished = finished ? 1 : 0;
    sidecar.progress.updated_at = Date.now();
  } else if (fallbackChapterId) {
    sidecar.progress = {
      chapter_id: fallbackChapterId,
      position_ms: 0,
      updated_at: Date.now(),
      finished: finished ? 1 : 0,
    };
  }
  await writeSidecar(bookFolderUri, sidecar);
}

/** Get all bookmarks for a book, newest first. */
export async function getBookmarks(bookFolderUri: string): Promise<BookBookmark[]> {
  const sidecar = await readSidecar(bookFolderUri);
  return [...sidecar.bookmarks].sort((a, b) => b.created_at - a.created_at);
}

/** Add a bookmark and return it. */
export async function addBookmark(
  bookFolderUri: string,
  chapterId: string,
  positionMs: number,
  note: string | null = null
): Promise<BookBookmark> {
  const sidecar = await readSidecar(bookFolderUri);
  const bookmark: BookBookmark = {
    id: 'bm_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    chapter_id: chapterId,
    position_ms: Math.floor(positionMs),
    note,
    created_at: Date.now(),
  };
  sidecar.bookmarks.push(bookmark);
  await writeSidecar(bookFolderUri, sidecar);
  return bookmark;
}

/** Update a bookmark's note text. */
export async function updateBookmarkNote(
  bookFolderUri: string,
  bookmarkId: string,
  note: string
): Promise<void> {
  const sidecar = await readSidecar(bookFolderUri);
  const bm = sidecar.bookmarks.find((b) => b.id === bookmarkId);
  if (bm) {
    bm.note = note;
    await writeSidecar(bookFolderUri, sidecar);
  }
}

/** Delete a bookmark by ID. */
export async function deleteBookmark(bookFolderUri: string, bookmarkId: string): Promise<void> {
  const sidecar = await readSidecar(bookFolderUri);
  sidecar.bookmarks = sidecar.bookmarks.filter((b) => b.id !== bookmarkId);
  await writeSidecar(bookFolderUri, sidecar);
}

/** Invalidate the cached sidecar URI for a book folder (e.g. after removing a book). */
export function invalidateSidecarCache(bookFolderUri: string): void {
  sidecarUriCache.delete(bookFolderUri);
}
