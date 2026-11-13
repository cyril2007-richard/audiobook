export interface Book {
  id: string;
  title: string;
  author: string | null;
  series_id: string | null;
  series_order: number | null;
  path: string; // SAF directory URI for the book folder
  cover_path: string | null;
  accent_color?: string | null;
  duration: number; // seconds
  added_at: number; // Unix timestamp ms
  is_missing: number; // 0 | 1
}

export interface Series {
  id: string;
  name: string;
  cover_path: string | null;
}

export interface Chapter {
  id: string;
  book_id: string;
  title: string;
  file_path: string; // SAF file URI
  order_index: number;
  duration: number; // seconds
}

/** Progress stored in the book's lumen.json sidecar. */
export interface BookProgress {
  chapter_id: string;
  position_ms: number;
  updated_at: number;
  finished: number; // 0 | 1
}

/** Bookmark stored in the book's lumen.json sidecar. */
export interface Bookmark {
  id: string;
  book_id: string;   // kept for UI convenience, not in the JSON
  chapter_id: string;
  position_ms: number;
  note: string | null;
  created_at: number;
}

export interface ScanStateRecord {
  file_path: string;
  size: number;
  modified_time: number;
}

export interface BookWithDetails extends Book {
  series_name?: string | null;
  chapter_count?: number;
  // These are populated after loading the sidecar (async):
  current_chapter_id?: string | null;
  current_chapter_title?: string | null;
  position_ms?: number;
  finished?: number;
  last_played_at?: number;
}

export interface SeriesWithBooks extends Series {
  books: BookWithDetails[];
  total_duration: number;
  completed_books_count: number;
}
