/**
 * Global SQLite database — library index only.
 *
 * Progress and bookmarks are no longer stored here.
 * They live in a per-book `lumen.json` sidecar file inside each book's
 * SAF folder (see src/services/book-store.ts).
 *
 * Tables kept here:
 *   series, books, chapters, scan_state, settings
 */
import * as SQLite from 'expo-sqlite';
import {
  Series,
  Chapter,
  BookWithDetails,
  SeriesWithBooks,
  ScanStateRecord,
} from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('lumen.db');
    initDatabase(dbInstance);
  }
  return dbInstance;
}

function initDatabase(db: SQLite.SQLiteDatabase) {
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');

  db.execSync(`
    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      cover_path TEXT
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      series_id TEXT,
      series_order REAL,
      path TEXT NOT NULL UNIQUE,
      cover_path TEXT,
      accent_color TEXT,
      duration REAL NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL,
      is_missing INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      duration REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scan_state (
      file_path TEXT PRIMARY KEY NOT NULL,
      size INTEGER NOT NULL,
      modified_time INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_books_series ON books(series_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, order_index);
  `);

  // Safe migration: add accent_color column if upgrading from an older build
  try {
    const tableInfo = db.getAllSync<{ name: string }>('PRAGMA table_info(books)');
    const hasAccent = tableInfo.some((col) => col.name === 'accent_color');
    if (!hasAccent) {
      db.execSync('ALTER TABLE books ADD COLUMN accent_color TEXT;');
    }
  } catch (err) {
    console.warn('Migration accent_color check notice:', err);
  }

  // Migration: drop legacy progress / bookmarks tables if they still exist
  // (data was stored locally; users need to re-add progress via play)
  try {
    db.execSync('DROP TABLE IF EXISTS progress;');
    db.execSync('DROP TABLE IF EXISTS bookmarks;');
  } catch (err) {
    console.warn('Migration drop legacy tables notice:', err);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(key: string, defaultValue: string | null = null): string | null {
  const db = getDatabase();
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

// ─── Books ────────────────────────────────────────────────────────────────────

export function getAllBooks(): BookWithDetails[] {
  const db = getDatabase();
  return db.getAllSync<BookWithDetails>(`
    SELECT
      b.*,
      s.name AS series_name,
      (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) AS chapter_count
    FROM books b
    LEFT JOIN series s ON b.series_id = s.id
    WHERE b.is_missing = 0
    ORDER BY b.added_at DESC
  `);
}

export function getBookById(id: string): BookWithDetails | null {
  const db = getDatabase();
  return db.getFirstSync<BookWithDetails>(
    `
    SELECT
      b.*,
      s.name AS series_name,
      (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) AS chapter_count
    FROM books b
    LEFT JOIN series s ON b.series_id = s.id
    WHERE b.id = ?
  `,
    [id]
  );
}

export function getBookChapters(bookId: string): Chapter[] {
  const db = getDatabase();
  return db.getAllSync<Chapter>(
    'SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index ASC',
    [bookId]
  );
}

export function updateBookCover(bookId: string, coverPath: string): void {
  const db = getDatabase();
  db.runSync('UPDATE books SET cover_path = ?, accent_color = NULL WHERE id = ?', [coverPath, bookId]);
}

export function updateBookAccentColor(bookId: string, accentColor: string): void {
  const db = getDatabase();
  db.runSync('UPDATE books SET accent_color = ? WHERE id = ?', [accentColor, bookId]);
}

export function updateBookTitle(bookId: string, title: string, author?: string | null): void {
  const db = getDatabase();
  if (author !== undefined) {
    db.runSync('UPDATE books SET title = ?, author = ? WHERE id = ?', [title, author, bookId]);
  } else {
    db.runSync('UPDATE books SET title = ? WHERE id = ?', [title, bookId]);
  }
}

// ─── Series ───────────────────────────────────────────────────────────────────

export function getAllSeries(): SeriesWithBooks[] {
  const db = getDatabase();
  const seriesRows = db.getAllSync<Series>('SELECT * FROM series ORDER BY name ASC');
  const allBooks = getAllBooks();

  return seriesRows.map((s) => {
    const books = allBooks
      .filter((b) => b.series_id === s.id)
      .sort((a, b) => (a.series_order ?? 9999) - (b.series_order ?? 9999));
    const totalDuration = books.reduce((sum, b) => sum + (b.duration || 0), 0);
    const completedBooks = books.filter((b) => b.finished === 1).length;

    return {
      ...s,
      books,
      total_duration: totalDuration,
      completed_books_count: completedBooks,
    };
  });
}

export function getSeriesById(id: string): SeriesWithBooks | null {
  const db = getDatabase();
  const seriesRow = db.getFirstSync<Series>('SELECT * FROM series WHERE id = ?', [id]);
  if (!seriesRow) return null;

  const allBooks = getAllBooks();
  const books = allBooks
    .filter((b) => b.series_id === seriesRow.id)
    .sort((a, b) => (a.series_order ?? 9999) - (b.series_order ?? 9999));
  const totalDuration = books.reduce((sum, b) => sum + (b.duration || 0), 0);
  const completedBooks = books.filter((b) => b.finished === 1).length;

  return {
    ...seriesRow,
    books,
    total_duration: totalDuration,
    completed_books_count: completedBooks,
  };
}

// ─── Scan state ───────────────────────────────────────────────────────────────

export function getAllScanState(): Map<string, ScanStateRecord> {
  const db = getDatabase();
  const rows = db.getAllSync<ScanStateRecord>('SELECT * FROM scan_state');
  const map = new Map<string, ScanStateRecord>();
  for (const r of rows) {
    map.set(r.file_path, r);
  }
  return map;
}

export function setScanState(filePath: string, size: number, modifiedTime: number): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO scan_state (file_path, size, modified_time)
     VALUES (?, ?, ?)
     ON CONFLICT(file_path) DO UPDATE SET
       size = excluded.size,
       modified_time = excluded.modified_time`,
    [filePath, size, modifiedTime]
  );
}
