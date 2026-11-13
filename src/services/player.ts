import { AppState, AppStateStatus } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  AudioPlayer,
  AudioStatus,
} from 'expo-audio';
import {
  getBookById,
  getBookChapters,
  getSetting,
  getSeriesById,
} from '../db';
import {
  getBookProgress,
  saveBookProgress,
  markBookFinished,
  addBookmark,
} from './book-store';
import { BookWithDetails, Chapter, Bookmark } from '../types';

export interface PlayerState {
  currentBook: BookWithDetails | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];
  isPlaying: boolean;
  isLoading: boolean;
  position: number; // seconds
  duration: number; // seconds
  speed: number;
  sleepTimer: {
    durationMinutes: number | 'end_of_chapter' | null;
    remainingSeconds: number | null;
  };
  errorMessage: string | null;
}

type PlayerStateListener = (state: PlayerState) => void;

class PlayerService {
  private player: AudioPlayer | null = null;
  private state: PlayerState = {
    currentBook: null,
    currentChapter: null,
    chapters: [],
    isPlaying: false,
    isLoading: false,
    position: 0,
    duration: 0,
    speed: 1.0,
    sleepTimer: {
      durationMinutes: null,
      remainingSeconds: null,
    },
    errorMessage: null,
  };

  private listeners = new Set<PlayerStateListener>();
  private autosaveInterval: ReturnType<typeof setInterval> | null = null;
  private sleepTimerInterval: ReturnType<typeof setInterval> | null = null;
  private originalVolume = 1.0;
  private isFadingOut = false;

  constructor() {
    this.initAudioMode();
    this.setupAppStateListener();
  }

  private async initAudioMode() {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
    } catch (e) {
      console.warn('Failed to set audio mode:', e);
    }
  }

  private setupAppStateListener() {
    AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        this.saveCurrentPosition();
      }
    });
  }

  public subscribe(listener: PlayerStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): PlayerState {
    return { ...this.state };
  }

  private setState(updates: Partial<PlayerState>) {
    this.state = { ...this.state, ...updates };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Player state listener error:', err);
      }
    }
  }

  /**
   * Load and prepare a book for playback.
   *
   * Progress is read from the book folder's lumen.json sidecar.
   */
  public async loadBook(
    bookId: string,
    targetChapterId?: string,
    customResumeMs?: number
  ): Promise<void> {
    try {
      this.setState({ isLoading: true, errorMessage: null });

      const book = getBookById(bookId);
      if (!book) {
        this.setState({ isLoading: false, errorMessage: 'Book not found in library.' });
        return;
      }

      const chapters = getBookChapters(bookId);
      if (chapters.length === 0) {
        this.setState({ isLoading: false, errorMessage: 'No audio chapters found for this book.' });
        return;
      }

      // Determine starting chapter and position
      // Progress is read from the book's SAF folder sidecar
      let chapter = chapters[0];
      let startPositionSec = 0;

      if (targetChapterId) {
        const found = chapters.find((c) => c.id === targetChapterId);
        if (found) chapter = found;
      } else {
        // No explicit chapter — resume from sidecar
        const savedProgress = await getBookProgress(book.path);
        if (savedProgress?.chapter_id) {
          const found = chapters.find((c) => c.id === savedProgress.chapter_id);
          if (found) {
            chapter = found;
            const rewindMs = 3000;
            const posMs =
              customResumeMs !== undefined ? customResumeMs : savedProgress.position_ms;
            startPositionSec = Math.max(0, (posMs - rewindMs) / 1000);
          }
        }
      }

      // If a custom position was given alongside an explicit chapter, honour it
      if (targetChapterId && customResumeMs !== undefined && customResumeMs > 0) {
        const rewindMs = 3000;
        startPositionSec = Math.max(0, (customResumeMs - rewindMs) / 1000);
      }

      await this.loadChapter(book, chapter, chapters, startPositionSec);
    } catch (err: any) {
      console.error('Error loading book:', err);
      this.setState({ isLoading: false, errorMessage: err?.message || 'Failed to load audio.' });
    }
  }

  /**
   * Resume the in-progress book for a series.
   */
  public async resumeSeries(seriesId: string): Promise<void> {
    const series = getSeriesById(seriesId);
    if (!series || series.books.length === 0) return;

    const unfinishedBook = series.books.find((b) => b.finished !== 1) || series.books[0];
    await this.loadBook(unfinishedBook.id);
    await this.play();
  }

  /**
   * Load a specific chapter file and prepare the AudioPlayer.
   */
  private async loadChapter(
    book: BookWithDetails,
    chapter: Chapter,
    chapters: Chapter[],
    startPositionSec: number = 0
  ): Promise<void> {
    try {
      if (this.player) {
        try {
          this.player.pause();
          this.player.clearLockScreenControls();
        } catch {}
      }

      const defaultSpeedStr = getSetting('default_playback_speed', '1.0');
      const defaultSpeed = parseFloat(defaultSpeedStr || '1.0') || 1.0;

      this.player = createAudioPlayer(chapter.file_path, { updateInterval: 500 });

      try {
        this.player.setPlaybackRate(defaultSpeed);
      } catch (e) {
        console.warn('Failed to set playback rate:', e);
      }

      this.player.setActiveForLockScreen(
        true,
        {
          title: chapter.title || book.title,
          artist: book.author || 'Lumen Audiobook',
          albumTitle: book.series_name || book.title,
          artworkUrl: book.cover_path || undefined,
        },
        {
          showSeekForward: true,
          showSeekBackward: true,
          showNextTrack: true,
          showPreviousTrack: true,
        }
      );

      this.player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        this.handlePlaybackStatusUpdate(status);
      });

      this.setState({
        currentBook: book,
        currentChapter: chapter,
        chapters,
        isLoading: false,
        isPlaying: false,
        position: startPositionSec,
        duration: chapter.duration || 0,
        speed: defaultSpeed,
        errorMessage: null,
      });

      if (startPositionSec > 0) {
        try {
          await this.player.seekTo(startPositionSec);
        } catch {}
      }

      this.startAutosave();
    } catch (error: any) {
      console.error('Error loading chapter:', chapter.title, error);
      this.setState({
        isLoading: false,
        errorMessage: `Cannot play "${chapter.title}". File may be corrupt or inaccessible.`,
      });
    }
  }

  private handlePlaybackStatusUpdate(status: AudioStatus) {
    if (status.didJustFinish) {
      this.handleChapterFinished();
      return;
    }

    this.setState({
      isPlaying: status.playing,
      position: status.currentTime,
      duration: status.duration > 0 ? status.duration : this.state.duration,
      isLoading: status.isBuffering,
    });
  }

  private async handleChapterFinished() {
    const { currentBook, currentChapter, chapters, sleepTimer } = this.state;
    if (!currentBook || !currentChapter) return;

    if (sleepTimer.durationMinutes === 'end_of_chapter') {
      this.pause();
      this.clearSleepTimer();
      this.saveCurrentPosition();
      return;
    }

    const currentIndex = chapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
      const nextChapter = chapters[currentIndex + 1];
      await this.loadChapter(currentBook, nextChapter, chapters, 0);
      await this.play();
    } else {
      // End of book — mark finished in sidecar
      markBookFinished(currentBook.path, true, currentChapter.id);
      this.pause();
      this.setState({ isPlaying: false, position: 0 });
    }
  }

  public async play(): Promise<void> {
    if (!this.player) return;
    try {
      this.player.play();
      this.setState({ isPlaying: true });
    } catch (e: any) {
      console.error('Play error:', e);
      this.setState({ errorMessage: 'Cannot play audio.' });
    }
  }

  public pause(): void {
    if (!this.player) return;
    try {
      this.player.pause();
      this.setState({ isPlaying: false });
      this.saveCurrentPosition();
    } catch (e) {
      console.error('Pause error:', e);
    }
  }

  public togglePlayPause(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public async seekTo(seconds: number): Promise<void> {
    if (!this.player) return;
    try {
      const target = Math.max(0, Math.min(seconds, this.state.duration || 999999));
      await this.player.seekTo(target);
      this.setState({ position: target });
      this.saveCurrentPosition();
    } catch (e) {
      console.error('Seek error:', e);
    }
  }

  public skipForward(seconds: number = 30): void {
    this.seekTo(this.state.position + seconds);
  }

  public skipBackward(seconds: number = 15): void {
    this.seekTo(Math.max(0, this.state.position - seconds));
  }

  public async nextChapter(): Promise<void> {
    const { currentBook, currentChapter, chapters } = this.state;
    if (!currentBook || !currentChapter) return;

    const currentIndex = chapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
      const nextChapter = chapters[currentIndex + 1];
      this.saveCurrentPosition();
      await this.loadChapter(currentBook, nextChapter, chapters, 0);
      if (this.state.isPlaying) await this.play();
    }
  }

  public async previousChapter(): Promise<void> {
    const { currentBook, currentChapter, chapters, position } = this.state;
    if (!currentBook || !currentChapter) return;

    if (position > 5) {
      await this.seekTo(0);
      return;
    }

    const currentIndex = chapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex > 0) {
      const prevChapter = chapters[currentIndex - 1];
      this.saveCurrentPosition();
      await this.loadChapter(currentBook, prevChapter, chapters, 0);
      if (this.state.isPlaying) await this.play();
    } else {
      await this.seekTo(0);
    }
  }

  public setPlaybackSpeed(speed: number): void {
    if (!this.player) return;
    try {
      this.player.setPlaybackRate(speed);
      this.setState({ speed });
    } catch (e) {
      console.error('Speed change error:', e);
    }
  }

  /**
   * Configure sleep timer with 20s gradual volume fade-out.
   */
  public setSleepTimer(duration: number | 'end_of_chapter' | null): void {
    this.clearSleepTimer();

    if (!duration) {
      this.setState({ sleepTimer: { durationMinutes: null, remainingSeconds: null } });
      return;
    }

    if (duration === 'end_of_chapter') {
      this.setState({ sleepTimer: { durationMinutes: 'end_of_chapter', remainingSeconds: null } });
      return;
    }

    let remaining = duration * 60;
    this.originalVolume = this.player?.volume ?? 1.0;
    this.isFadingOut = false;

    this.setState({
      sleepTimer: { durationMinutes: duration, remainingSeconds: remaining },
    });

    this.sleepTimerInterval = setInterval(() => {
      remaining -= 1;

      if (remaining <= 20 && remaining > 0 && this.player) {
        this.isFadingOut = true;
        const fadeRatio = remaining / 20;
        this.player.volume = Math.max(0, this.originalVolume * fadeRatio);
      }

      if (remaining <= 0) {
        this.pause();
        if (this.player) this.player.volume = this.originalVolume;
        this.clearSleepTimer();
        this.saveCurrentPosition();
        return;
      }

      this.setState({
        sleepTimer: { durationMinutes: duration, remainingSeconds: remaining },
      });
    }, 1000);
  }

  public clearSleepTimer(): void {
    if (this.sleepTimerInterval) {
      clearInterval(this.sleepTimerInterval);
      this.sleepTimerInterval = null;
    }
    if (this.isFadingOut && this.player) {
      this.player.volume = this.originalVolume;
    }
    this.isFadingOut = false;
    this.setState({ sleepTimer: { durationMinutes: null, remainingSeconds: null } });
  }

  /**
   * Save a quick bookmark to the book's sidecar file.
   */
  public createQuickBookmark(customNote?: string): void {
    const { currentBook, currentChapter, position } = this.state;
    if (!currentBook || !currentChapter) return;

    const mins = Math.floor(position / 60);
    const secs = Math.floor(position % 60);
    const timeFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const note = customNote || `Bookmark at ${timeFormatted}`;

    // Fire-and-forget — write is async but we don't need to await in the UI
    addBookmark(currentBook.path, currentChapter.id, Math.floor(position * 1000), note).catch(
      (err) => console.warn('[player] createQuickBookmark failed:', err)
    );
  }

  /**
   * Persist current playback position to the book's sidecar.
   */
  public saveCurrentPosition(): void {
    const { currentBook, currentChapter, position } = this.state;
    if (!currentBook || !currentChapter) return;

    // Fire-and-forget
    saveBookProgress(
      currentBook.path,
      currentChapter.id,
      Math.floor(position * 1000),
      false
    ).catch((err) => console.warn('[player] saveCurrentPosition failed:', err));
  }

  private startAutosave() {
    if (this.autosaveInterval) clearInterval(this.autosaveInterval);
    this.autosaveInterval = setInterval(() => {
      if (this.state.isPlaying) {
        this.saveCurrentPosition();
      }
    }, 5000);
  }

  public dismissError(): void {
    this.setState({ errorMessage: null });
  }
}

export const playerService = new PlayerService();
