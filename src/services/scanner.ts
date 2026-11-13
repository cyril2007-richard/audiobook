import { getDatabase } from '../db';
import {
  listDirectoryContents,
  getNameFromUri,
  isAudioFile,
  isImageFile,
  naturalCompare,
  parseSeriesOrderAndTitle,
} from './saf';
import { parseAudioMetadata, saveCoverImage } from './metadata';

function generateDeterministicId(prefix: string, input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${prefix}_${hash.toString(36)}`;
}

export interface ScanProgressEvent {
  status: 'idle' | 'scanning' | 'completed' | 'error';
  currentFolder?: string;
  booksFound: number;
  error?: string;
}

type ScanListener = (event: ScanProgressEvent) => void;
const listeners = new Set<ScanListener>();

export function subscribeScanProgress(listener: ScanListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(event: ScanProgressEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (e) {
      console.error('Scan listener error:', e);
    }
  }
}

let isScanningActive = false;

export function isScanInProgress(): boolean {
  return isScanningActive;
}

/**
 * Scan the library directory incrementally.
 */
export async function scanLibrary(rootUri: string): Promise<{ success: boolean; bookCount: number }> {
  if (isScanningActive) {
    return { success: false, bookCount: 0 };
  }

  isScanningActive = true;
  notifyListeners({ status: 'scanning', booksFound: 0 });

  const db = getDatabase();
  let totalBooksFound = 0;

  try {
    const rootItems = await listDirectoryContents(rootUri);

    for (const itemUri of rootItems) {
      const itemName = getNameFromUri(itemUri);
      notifyListeners({ status: 'scanning', currentFolder: itemName, booksFound: totalBooksFound });

      // Check if item is a folder by attempting to read its contents
      const subItems = await listDirectoryContents(itemUri);
      if (subItems.length === 0 && isAudioFile(itemUri)) {
        // Single audio file directly in root library folder
        await processSingleFileBook(itemUri, null, null);
        totalBooksFound++;
        continue;
      }

      const audioInItem = subItems.filter(isAudioFile);

      if (audioInItem.length > 0) {
        // Item is a Book folder directly under root (Standalone Book)
        await processBookFolder(itemUri, itemName, subItems, null, null);
        totalBooksFound++;
      } else {
        // Check if item is a Series folder containing book subfolders
        let hasSeriesBooks = false;
        let seriesId: string | null = null;

        // Check if series folder has a cover image
        const seriesCoverUri = subItems.find((uri) => {
          const n = getNameFromUri(uri).toLowerCase();
          return isImageFile(uri) && (n.startsWith('cover') || n.startsWith('folder'));
        });

        for (const subItemUri of subItems) {
          const subItemContents = await listDirectoryContents(subItemUri);
          const subItemAudio = subItemContents.filter(isAudioFile);

          if (subItemAudio.length > 0) {
            // It's a series! Create or find series record
            if (!seriesId) {
              seriesId = generateDeterministicId('series', itemName);
              let seriesCoverPath: string | null = null;
              if (seriesCoverUri) {
                seriesCoverPath = await saveCoverImage(seriesId, { uri: seriesCoverUri });
              }

              db.runSync(
                `INSERT INTO series (id, name, cover_path)
                 VALUES (?, ?, ?)
                 ON CONFLICT(name) DO UPDATE SET cover_path = COALESCE(excluded.cover_path, series.cover_path)`,
                [seriesId, itemName, seriesCoverPath]
              );
            }

            const bookFolderName = getNameFromUri(subItemUri);
            const { order, cleanTitle } = parseSeriesOrderAndTitle(bookFolderName);

            await processBookFolder(subItemUri, cleanTitle, subItemContents, seriesId, order);
            totalBooksFound++;
            hasSeriesBooks = true;
            notifyListeners({ status: 'scanning', currentFolder: bookFolderName, booksFound: totalBooksFound });
          }
        }

        if (hasSeriesBooks && seriesId) {
          // If series has no cover, inherit from the first book in the series
          const firstBook = db.getFirstSync<{ cover_path: string | null }>(
            'SELECT cover_path FROM books WHERE series_id = ? AND cover_path IS NOT NULL ORDER BY series_order ASC LIMIT 1',
            [seriesId]
          );
          if (firstBook?.cover_path) {
            db.runSync('UPDATE series SET cover_path = ? WHERE id = ? AND cover_path IS NULL', [
              firstBook.cover_path,
              seriesId,
            ]);
          }
        }
      }
    }

    notifyListeners({ status: 'completed', booksFound: totalBooksFound });
    return { success: true, bookCount: totalBooksFound };
  } catch (error: any) {
    console.error('Library scan error:', error);
    notifyListeners({ status: 'error', booksFound: totalBooksFound, error: error?.message || 'Unknown scan error' });
    return { success: false, bookCount: totalBooksFound };
  } finally {
    isScanningActive = false;
  }
}

/**
 * Process a folder that represents a book with audio chapters.
 */
async function processBookFolder(
  bookUri: string,
  defaultTitle: string,
  contents: string[],
  seriesId: string | null,
  seriesOrder: number | null
): Promise<void> {
  const db = getDatabase();
  const bookId = generateDeterministicId('book', bookUri);

  // Look for cover image in folder (cover.jpg, folder.jpg, etc.)
  const imageFiles = contents.filter(isImageFile);
  let coverUri = imageFiles.find((uri) => {
    const n = getNameFromUri(uri).toLowerCase();
    return n.startsWith('cover') || n.startsWith('folder');
  }) || imageFiles[0];

  // Natural sort audio files
  const audioFiles = contents.filter(isAudioFile).sort((a, b) => {
    return naturalCompare(getNameFromUri(a), getNameFromUri(b));
  });

  if (audioFiles.length === 0) return;

  // Read metadata from first audio file for author / title fallback
  const firstAudio = audioFiles[0];
  const firstAudioName = getNameFromUri(firstAudio);
  const metadata = await parseAudioMetadata(firstAudio, firstAudioName);

  let bookTitle = defaultTitle;
  if (metadata.album && metadata.album.trim().length > 0 && !seriesId) {
    // If standalone book has album tag, keep folder title or use tag
  }

  let bookAuthor = metadata.artist || null;

  // Handle cover art
  let cachedCoverPath: string | null = null;
  const existingBook = db.getFirstSync<{ cover_path: string | null }>('SELECT cover_path FROM books WHERE id = ?', [bookId]);

  if (existingBook?.cover_path) {
    cachedCoverPath = existingBook.cover_path;
  } else if (coverUri) {
    cachedCoverPath = await saveCoverImage(bookId, { uri: coverUri });
  } else if (metadata.coverData) {
    cachedCoverPath = await saveCoverImage(bookId, {
      bytes: metadata.coverData.bytes,
      mime: metadata.coverData.mime,
    });
  }

  // Insert or update book
  const now = Date.now();
  db.runSync(
    `INSERT INTO books (id, title, author, series_id, series_order, path, cover_path, duration, added_at, is_missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(path) DO UPDATE SET
       title = excluded.title,
       author = COALESCE(excluded.author, books.author),
       series_id = COALESCE(excluded.series_id, books.series_id),
       series_order = COALESCE(excluded.series_order, books.series_order),
       cover_path = COALESCE(books.cover_path, excluded.cover_path),
       is_missing = 0`,
    [bookId, bookTitle, bookAuthor, seriesId, seriesOrder, bookUri, cachedCoverPath, 0, now]
  );

  // Insert chapters
  let totalBookDuration = 0;
  for (let i = 0; i < audioFiles.length; i++) {
    const fileUri = audioFiles[i];
    const fileName = getNameFromUri(fileUri);
    const chapterId = `ch_${bookId}_${i + 1}`;

    // Clean title for chapter (remove extension and leading numbers)
    const cleanChapterName = fileName.replace(/\.[^/.]+$/, '');
    const { cleanTitle: chTitle } = parseSeriesOrderAndTitle(cleanChapterName);

    // Duration estimate or tag duration
    const chDuration = (i === 0 && metadata.duration) ? metadata.duration : 0;
    totalBookDuration += chDuration;

    db.runSync(
      `INSERT INTO chapters (id, book_id, title, file_path, order_index, duration)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         file_path = excluded.file_path,
         order_index = excluded.order_index`,
      [chapterId, bookId, chTitle || cleanChapterName, fileUri, i + 1, chDuration]
    );
  }

  if (totalBookDuration > 0) {
    db.runSync('UPDATE books SET duration = ? WHERE id = ?', [totalBookDuration, bookId]);
  }
}

/**
 * Process a single standalone file as a book.
 */
async function processSingleFileBook(fileUri: string, seriesId: string | null, seriesOrder: number | null): Promise<void> {
  const db = getDatabase();
  const bookId = generateDeterministicId('book', fileUri);
  const fileName = getNameFromUri(fileUri);
  const metadata = await parseAudioMetadata(fileUri, fileName);

  const cleanName = fileName.replace(/\.[^/.]+$/, '');
  const title = metadata.title || cleanName;
  const author = metadata.artist || null;

  let cachedCoverPath: string | null = null;
  const existingBook = db.getFirstSync<{ cover_path: string | null }>('SELECT cover_path FROM books WHERE id = ?', [bookId]);

  if (existingBook?.cover_path) {
    cachedCoverPath = existingBook.cover_path;
  } else if (metadata.coverData) {
    cachedCoverPath = await saveCoverImage(bookId, {
      bytes: metadata.coverData.bytes,
      mime: metadata.coverData.mime,
    });
  }

  const duration = metadata.duration || 0;
  const now = Date.now();

  db.runSync(
    `INSERT INTO books (id, title, author, series_id, series_order, path, cover_path, duration, added_at, is_missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(path) DO UPDATE SET
       title = excluded.title,
       author = COALESCE(excluded.author, books.author),
       cover_path = COALESCE(books.cover_path, excluded.cover_path),
       duration = excluded.duration,
       is_missing = 0`,
    [bookId, title, author, seriesId, seriesOrder, fileUri, cachedCoverPath, duration, now]
  );

  const chapterId = `ch_${bookId}_1`;
  db.runSync(
    `INSERT INTO chapters (id, book_id, title, file_path, order_index, duration)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       file_path = excluded.file_path`,
    [chapterId, bookId, title, fileUri, 1, duration]
  );
}
