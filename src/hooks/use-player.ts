import { useState, useEffect } from 'react';
import { playerService, PlayerState } from '../services/player';

export function usePlayer(): PlayerState & {
  play: () => Promise<void>;
  pause: () => void;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  nextChapter: () => Promise<void>;
  previousChapter: () => Promise<void>;
  setPlaybackSpeed: (speed: number) => void;
  setSleepTimer: (duration: number | 'end_of_chapter' | null) => void;
  clearSleepTimer: () => void;
  createQuickBookmark: (note?: string) => void;
  loadBook: (bookId: string, chapterId?: string, resumePositionMs?: number) => Promise<void>;
  resumeSeries: (seriesId: string) => Promise<void>;
  dismissError: () => void;
} {
  const [state, setState] = useState<PlayerState>(playerService.getState());

  useEffect(() => {
    const unsubscribe = playerService.subscribe((updatedState) => {
      setState(updatedState);
    });
    return unsubscribe;
  }, []);

  return {
    ...state,
    play: () => playerService.play(),
    pause: () => playerService.pause(),
    togglePlayPause: () => playerService.togglePlayPause(),
    seekTo: (s: number) => playerService.seekTo(s),
    skipForward: (s?: number) => playerService.skipForward(s),
    skipBackward: (s?: number) => playerService.skipBackward(s),
    nextChapter: () => playerService.nextChapter(),
    previousChapter: () => playerService.previousChapter(),
    setPlaybackSpeed: (speed: number) => playerService.setPlaybackSpeed(speed),
    setSleepTimer: (d: number | 'end_of_chapter' | null) => playerService.setSleepTimer(d),
    clearSleepTimer: () => playerService.clearSleepTimer(),
    createQuickBookmark: (note?: string) => {
      playerService.createQuickBookmark(note);
    },
    loadBook: (bookId: string, chapterId?: string, resumePositionMs?: number) =>
      playerService.loadBook(bookId, chapterId, resumePositionMs),
    resumeSeries: (seriesId: string) => playerService.resumeSeries(seriesId),
    dismissError: () => playerService.dismissError(),
  };
}
