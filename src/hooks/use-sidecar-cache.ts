/**
 * Hook that exposes a sidecar cache for the whole app.
 *
 * Usage:
 *   const { getSidecar, refreshSidecar, refreshAll } = useSidecarCache(books);
 *   const sc = getSidecar(bookFolderUri);  // BookProgress | null
 *
 * On mount (or when `books` changes) it queues async reads for every book
 * and stores results in state so components re-render once data arrives.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getBookProgress, getBookmarks, BookProgress, BookBookmark } from '../services/book-store';
import { BookWithDetails } from '../types';

export interface SidecarEntry {
  progress: BookProgress | null;
  bookmarks: BookBookmark[];
  loaded: boolean;
}

type SidecarMap = Record<string, SidecarEntry>;

const EMPTY: SidecarEntry = { progress: null, bookmarks: [], loaded: false };

export function useSidecarCache(books: BookWithDetails[]) {
  const [cache, setCache] = useState<SidecarMap>({});
  // Track which paths we've already kicked off a load for
  const loadingRef = useRef<Set<string>>(new Set());
  const booksRef = useRef(books);

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  const loadOne = useCallback(async (path: string) => {
    if (loadingRef.current.has(path)) return;
    loadingRef.current.add(path);
    try {
      const [progress, bookmarks] = await Promise.all([
        getBookProgress(path),
        getBookmarks(path),
      ]);
      setCache((prev) => ({
        ...prev,
        [path]: { progress, bookmarks, loaded: true },
      }));
    } catch {
      setCache((prev) => ({
        ...prev,
        [path]: { progress: null, bookmarks: [], loaded: true },
      }));
    }
  }, []);

  // Kick off loads for any new books
  useEffect(() => {
    for (const book of books) {
      if (book.path && !loadingRef.current.has(book.path)) {
        loadOne(book.path);
      }
    }
  }, [books, loadOne]);

  const getSidecar = useCallback(
    (path: string | undefined | null): SidecarEntry => {
      if (!path) return EMPTY;
      return cache[path] ?? EMPTY;
    },
    [cache]
  );

  const refreshSidecar = useCallback(
    async (path: string) => {
      loadingRef.current.delete(path); // allow re-load
      await loadOne(path);
    },
    [loadOne]
  );

  const refreshAll = useCallback(async () => {
    loadingRef.current.clear();
    for (const book of booksRef.current) {
      if (book.path) await loadOne(book.path);
    }
  }, [loadOne]);

  return { getSidecar, refreshSidecar, refreshAll, cache };
}
