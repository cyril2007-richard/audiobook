import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import {
  getBookById,
  getBookChapters,
  updateBookCover,
  updateBookAccentColor,
} from '../../db';
import {
  getBookmarks,
  deleteBookmark,
  updateBookmarkNote,
  getBookProgress,
  BookBookmark,
  BookProgress,
} from '../../services/book-store';
import { usePlayer } from '../../hooks/use-player';
import { BookWithDetails, Chapter, Bookmark } from '../../types';
import { CoverImage } from '../../components/cover-image';
import { Icon } from '../../components/icon';
import { C, R, S, T, SCROLL_BOTTOM_INSET } from '../../constants/theme';
import { extractAccentColor } from '../../services/palette';
import { saveCoverImage } from '../../services/metadata';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_WIDTH = Math.round(SCREEN_WIDTH * 0.56);
const COVER_HEIGHT = Math.round(COVER_WIDTH * 1.45);

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    currentBook: activeBook,
    currentChapter: activeChapter,
    isPlaying,
    position,
    duration,
    speed,
    sleepTimer,
    play,
    pause,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    setPlaybackSpeed,
    setSleepTimer,
    clearSleepTimer,
    createQuickBookmark,
    loadBook,
  } = usePlayer();

  const [book, setBook] = useState<BookWithDetails | null>(() => (id ? getBookById(id) : null));
  const [chapters, setChapters] = useState<Chapter[]>(() => (id ? getBookChapters(id) : []));
  const [accentColor, setAccentColor] = useState<string>(() => {
    const initialBook = id ? getBookById(id) : null;
    return initialBook?.accent_color || C.accent;
  });

  // Sidecar-sourced progress and bookmarks (async)
  const [progress, setProgress] = useState<BookProgress | null>(null);
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);

  // Modals
  const [speedModalVisible, setSpeedModalVisible] = useState(false);
  const [sleepModalVisible, setSleepModalVisible] = useState(false);
  const [bookmarksModalVisible, setBookmarksModalVisible] = useState(false);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');

  /** Reload all data from SQLite + sidecar. */
  const loadData = useCallback(async () => {
    if (!id) return;
    const freshBook = getBookById(id);
    setBook(freshBook);
    setChapters(getBookChapters(id));
    if (freshBook?.path) {
      const [prog, bms] = await Promise.all([
        getBookProgress(freshBook.path),
        getBookmarks(freshBook.path),
      ]);
      setProgress(prog);
      setBookmarks(bms);
    }
  }, [id]);

  // Initial sidecar load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when the active player book/chapter changes (progress may have updated)
  useEffect(() => {
    if (activeBook?.id === id) {
      loadData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBook?.id, activeChapter?.id]);

  useEffect(() => {
    let isMounted = true;
    if (book?.accent_color) return;

    if (book?.cover_path && book?.id) {
      extractAccentColor(book.cover_path).then((color) => {
        if (isMounted && color) {
          setAccentColor(color);
          updateBookAccentColor(book.id, color);
        }
      });
    }
    return () => { isMounted = false; };
  }, [book?.id, book?.cover_path, book?.accent_color]);

  const refreshBookmarks = useCallback(async () => {
    if (book?.path) {
      setBookmarks(await getBookmarks(book.path));
    }
  }, [book?.path]);

  if (!book) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Book not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isCurrentActiveBook = activeBook?.id === book.id;
  const currentPos = isCurrentActiveBook ? position : (progress?.position_ms ?? 0) / 1000;
  const currentDur = isCurrentActiveBook && duration > 0 ? duration : (book.duration || 1);
  const progressPercent = currentDur > 0 ? Math.min(100, Math.max(0, (currentPos / currentDur) * 100)) : 0;
  const remainingTime = Math.max(0, currentDur - currentPos);

  // The chapter to resume — from sidecar progress, falling back to first chapter
  const resumeChapter =
    chapters.find((c) => c.id === progress?.chapter_id) || chapters[0];

  const handleMainPlayPause = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isCurrentActiveBook) {
      togglePlayPause();
    } else {
      // resumeChapter and resumePosMs come from the sidecar (or default to start)
      const resumePosMs = progress?.position_ms ?? 0;
      await loadBook(book.id, resumeChapter?.id, resumePosMs);
      await play();
    }
  };

  const handleSkipBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isCurrentActiveBook) {
      skipBackward(15);
    } else {
      seekTo(Math.max(0, currentPos - 15));
    }
  };

  const handleSkipForward = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isCurrentActiveBook) {
      skipForward(30);
    } else {
      seekTo(Math.min(currentDur, currentPos + 30));
    }
  };

  const handleSeekBarPress = (e: any) => {
    const { locationX } = e.nativeEvent;
    const barWidth = SCREEN_WIDTH - S.xl * 2;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    const targetSeconds = ratio * currentDur;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isCurrentActiveBook) {
      seekTo(targetSeconds);
    }
  };

  const handleChapterPlayToggle = async (ch: Chapter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isThisChapterPlaying = isCurrentActiveBook && activeChapter?.id === ch.id && isPlaying;

    if (isThisChapterPlaying) {
      pause();
    } else if (isCurrentActiveBook && activeChapter?.id === ch.id) {
      play();
    } else {
      await loadBook(book.id, ch.id, 0);
      await play();
    }
  };

  const handleQuickBookmark = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    createQuickBookmark();
    // Player writes the bookmark async; refresh after a short delay to pick it up
    setTimeout(() => { refreshBookmarks(); }, 300);
    setBookmarksModalVisible(true);
  };

  const handleChangeCover = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        const cachedPath = await saveCoverImage(book.id, { uri: pickedUri });
        if (cachedPath) {
          updateBookCover(book.id, cachedPath);
          loadData();
        }
      }
    } catch {
      // silently handle
    }
  };

  return (
    <View style={styles.container}>
      {/* Absolute Pinned Blurred Top Bar */}
      <View style={[styles.topBarWrapper, { paddingTop: insets.top }]}>
        <BlurView
          intensity={90}
          tint="dark"
          style={StyleSheet.absoluteFill}
          experimentalBlurMethod="dimezisBlurView"
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.72)' }]} />
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topIconButton}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="chevron-left" size={24} color={C.textPrimary} />
          </TouchableOpacity>

          {/* Speed button at top right */}
          <TouchableOpacity
            style={styles.speedButton}
            onPress={() => setSpeedModalVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.speedButtonText, { color: accentColor }]}>
              {speed.toFixed(2).replace(/\.00$/, '')}x
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 56 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Art - Long press 2s to change cover */}
        <TouchableOpacity
          activeOpacity={0.92}
          delayLongPress={2000}
          onLongPress={handleChangeCover}
          style={styles.artworkSection}
        >
          <CoverImage
            uri={book.cover_path}
            title={book.title}
            author={book.author}
            width={COVER_WIDTH}
            height={COVER_HEIGHT}
            borderRadius={R.lg}
            style={[styles.coverShadow, { shadowColor: accentColor }]}
          />
        </TouchableOpacity>

        {/* Book Title & Info */}
        <View style={styles.detailsSection}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {book.title}
          </Text>
          {book.author ? (
            <Text style={styles.bookAuthor} numberOfLines={1}>
              {book.author}
            </Text>
          ) : null}
          {/* Show active chapter from player, or saved progress chapter from sidecar */}
          {(isCurrentActiveBook ? activeChapter?.title : resumeChapter?.title) ? (
            <Text style={styles.chapterSubtitle} numberOfLines={1}>
              {isCurrentActiveBook ? activeChapter!.title : resumeChapter?.title}
            </Text>
          ) : null}
        </View>

        {/* Player Line (Seek Bar) */}
        <View style={styles.seekSection}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.seekTouchArea}
            onPress={handleSeekBarPress}
          >
            <View style={styles.seekTrack}>
              <View
                style={[
                  styles.seekFill,
                  { width: `${progressPercent}%`, backgroundColor: accentColor },
                ]}
              />
              <View
                style={[
                  styles.seekThumb,
                  { left: `${progressPercent}%`, backgroundColor: accentColor },
                ]}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.timeLabelsRow}>
            <Text style={styles.timeLabelText}>{formatTime(currentPos)}</Text>
            <Text style={styles.timeLabelText}>-{formatTime(remainingTime)}</Text>
          </View>
        </View>

        {/* Controls Row: sleep, 15 back, play/pause, 30 forward, bookmark */}
        <View style={styles.controlsRow}>
          {/* 1. Sleep Timer */}
          <TouchableOpacity
            style={styles.sideControlBtn}
            onPress={() => setSleepModalVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon
              name="timer"
              size={22}
              color={sleepTimer.durationMinutes ? accentColor : C.textSecondary}
            />
            {sleepTimer.durationMinutes ? (
              <Text style={[styles.timerBadge, { color: accentColor }]}>
                {sleepTimer.remainingSeconds !== null
                  ? `${Math.ceil(sleepTimer.remainingSeconds / 60)}m`
                  : 'Ch'}
              </Text>
            ) : null}
          </TouchableOpacity>

          {/* 2. Go back 15 secs */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkipBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="skip-backward-15" size={24} color={C.textPrimary} />
            <Text style={styles.skipSecText}>15</Text>
          </TouchableOpacity>

          {/* 3. Central Play / Pause Button */}
          <TouchableOpacity
            style={[styles.primaryPlayButton, { backgroundColor: accentColor }]}
            activeOpacity={0.85}
            onPress={handleMainPlayPause}
          >
            <Icon
              name={isCurrentActiveBook && isPlaying ? 'pause' : 'play'}
              size={30}
              color="#000000"
            />
          </TouchableOpacity>

          {/* 4. Go forward 30 secs */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkipForward}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="skip-forward-30" size={24} color={C.textPrimary} />
            <Text style={styles.skipSecText}>30</Text>
          </TouchableOpacity>

          {/* 5. Bookmark */}
          <TouchableOpacity
            style={styles.sideControlBtn}
            onPress={handleQuickBookmark}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon
              name="bookmark"
              size={22}
              color={bookmarks.length > 0 ? accentColor : C.textSecondary}
            />
            {bookmarks.length > 0 ? (
              <Text style={[styles.timerBadge, { color: accentColor }]}>
                {bookmarks.length}
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Chapters Section */}
        <View style={styles.chaptersSection}>
          <Text style={styles.sectionHeader}>
            CHAPTERS ({chapters.length})
          </Text>

          {chapters.map((ch, idx) => {
            // Highlight the chapter that is actively playing in the player,
            // OR — when this book is not loaded — the saved-progress chapter from sidecar.
            const isThisChapterActive = isCurrentActiveBook
              ? activeChapter?.id === ch.id
              : ch.id === progress?.chapter_id ||
                (!progress?.chapter_id && ch === chapters[0]);
            const isThisChapterPlaying = isThisChapterActive && isCurrentActiveBook && isPlaying;

            return (
              <TouchableOpacity
                key={ch.id}
                style={[
                  styles.chapterRow,
                  isThisChapterActive && [
                    styles.chapterRowActive,
                    { backgroundColor: accentColor },
                  ],
                ]}
                activeOpacity={0.75}
                onPress={() => handleChapterPlayToggle(ch)}
              >
                {/* Chapter Number */}
                <View style={styles.chapterNumBox}>
                  <Text
                    style={[
                      styles.chapterNumText,
                      isThisChapterActive && styles.chapterTextActive,
                    ]}
                  >
                    {ch.order_index ?? idx + 1}
                  </Text>
                </View>

                {/* Chapter Title & Duration */}
                <View style={styles.chapterInfo}>
                  <Text
                    style={[
                      styles.chapterTitle,
                      isThisChapterActive && styles.chapterTextActiveBold,
                    ]}
                    numberOfLines={1}
                  >
                    {ch.title}
                  </Text>
                  {ch.duration > 0 && (
                    <Text
                      style={[
                        styles.chapterDuration,
                        isThisChapterActive && styles.chapterDurationActive,
                      ]}
                    >
                      {formatTime(ch.duration)}
                    </Text>
                  )}
                </View>

                {/* Play / Pause button at right */}
                <TouchableOpacity
                  style={[
                    styles.chapterPlayBtn,
                    isThisChapterActive && styles.chapterPlayBtnActive,
                  ]}
                  onPress={() => handleChapterPlayToggle(ch)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon
                    name={isThisChapterPlaying ? 'pause' : 'play'}
                    size={16}
                    color={isThisChapterActive ? '#000000' : C.textPrimary}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Speed Selector Modal */}
      <Modal
        visible={speedModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSpeedModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSpeedModalVisible(false)}
        >
          <View style={styles.speedSheet}>
            <Text style={styles.modalSheetTitle}>Playback Speed</Text>
            <View style={styles.speedOptionsGrid}>
              {[0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.speedOptionBtn,
                    speed === s && { backgroundColor: accentColor },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPlaybackSpeed(s);
                    setSpeedModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.speedOptionText,
                      speed === s && { color: '#000000', fontWeight: '800' },
                    ]}
                  >
                    {s}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sleep Timer Modal */}
      <Modal
        visible={sleepModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSleepModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSleepModalVisible(false)}
        >
          <View style={styles.sleepSheet}>
            <Text style={styles.modalSheetTitle}>Sleep Timer</Text>
            <Text style={styles.modalSheetSubtitle}>
              Audio will smoothly fade out before pausing.
            </Text>

            {[15, 30, 45, 60].map((mins) => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.sheetOptionRow,
                  sleepTimer.durationMinutes === mins && { borderColor: accentColor },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSleepTimer(mins);
                  setSleepModalVisible(false);
                }}
              >
                <Text style={styles.sheetOptionText}>{mins} minutes</Text>
                {sleepTimer.durationMinutes === mins && (
                  <Text style={{ color: accentColor, fontWeight: '700' }}>Active</Text>
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[
                styles.sheetOptionRow,
                sleepTimer.durationMinutes === 'end_of_chapter' && {
                  borderColor: accentColor,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSleepTimer('end_of_chapter');
                setSleepModalVisible(false);
              }}
            >
              <Text style={styles.sheetOptionText}>End of Chapter</Text>
              {sleepTimer.durationMinutes === 'end_of_chapter' && (
                <Text style={{ color: accentColor, fontWeight: '700' }}>Active</Text>
              )}
            </TouchableOpacity>

            {sleepTimer.durationMinutes && (
              <TouchableOpacity
                style={styles.turnOffTimerBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  clearSleepTimer();
                  setSleepModalVisible(false);
                }}
              >
                <Text style={styles.turnOffTimerText}>Turn Off Timer</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bookmarks Modal */}
      <Modal
        visible={bookmarksModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBookmarksModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.bookmarksSheet}>
            <View style={styles.bookmarksHeader}>
              <Text style={styles.modalSheetTitle}>Bookmarks</Text>
              <TouchableOpacity
                style={styles.closeSheetBtn}
                onPress={() => setBookmarksModalVisible(false)}
              >
                <Icon name="close" size={18} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.bookmarksList}>
              {bookmarks.length === 0 ? (
                <Text style={styles.emptyBookmarksText}>
                  No bookmarks saved for this book yet.
                </Text>
              ) : (
                bookmarks.map((bm) => {
                  const targetSec = bm.position_ms / 1000;
                  const isEditing = editingBookmarkId === bm.id;

                  return (
                    <View key={bm.id} style={styles.bookmarkCard}>
                      <TouchableOpacity
                        style={styles.bookmarkMain}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          seekTo(targetSec);
                          setBookmarksModalVisible(false);
                        }}
                      >
                        <Text style={[styles.bookmarkTime, { color: accentColor }]}>
                          {formatTime(targetSec)}
                        </Text>
                        {!isEditing && (
                          <Text style={styles.bookmarkNote}>
                            {bm.note || 'Bookmark'}
                          </Text>
                        )}
                      </TouchableOpacity>

                      {isEditing ? (
                        <View style={styles.editNoteRow}>
                          <TextInput
                            style={styles.editNoteInput}
                            value={editingNote}
                            onChangeText={setEditingNote}
                            placeholder="Add note..."
                            placeholderTextColor={C.textTertiary}
                            autoFocus
                          />
                          <TouchableOpacity
                            style={[
                              styles.saveNoteBtn,
                              { backgroundColor: accentColor },
                            ]}
                            onPress={async () => {
                              if (book?.path) {
                                await updateBookmarkNote(book.path, bm.id, editingNote);
                              }
                              setEditingBookmarkId(null);
                              refreshBookmarks();
                            }}
                          >
                            <Text style={styles.saveNoteBtnText}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.bookmarkActions}>
                          <TouchableOpacity
                            onPress={() => {
                              setEditingBookmarkId(bm.id);
                              setEditingNote(bm.note || '');
                            }}
                            style={styles.bmActionBtn}
                          >
                            <Icon name="edit" size={16} color={C.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              if (book?.path) {
                                await deleteBookmark(book.path, bm.id);
                              }
                              refreshBookmarks();
                            }}
                              style={styles.bmActionBtn}
                          >
                            <Icon name="trash" size={16} color={C.danger} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.lg,
    paddingVertical: S.sm,
  },
  topIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedButton: {
    paddingHorizontal: S.md,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  speedButtonText: {
    ...T.captionStrong,
  },
  scrollContent: {
    paddingBottom: SCROLL_BOTTOM_INSET,
  },
  artworkSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: S.md,
  },
  coverShadow: {
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  detailsSection: {
    alignItems: 'center',
    paddingHorizontal: S.xl,
    marginTop: S.sm,
    marginBottom: S.md,
  },
  bookTitle: {
    ...T.screenTitle,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  bookAuthor: {
    ...T.body,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: 2,
  },
  chapterSubtitle: {
    ...T.caption,
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },
  seekSection: {
    paddingHorizontal: S.xl,
    marginVertical: S.xs,
  },
  seekTouchArea: {
    paddingVertical: S.md,
  },
  seekTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: R.pill,
    position: 'relative',
  },
  seekFill: {
    height: 4,
    borderRadius: R.pill,
  },
  seekThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  timeLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  timeLabelText: {
    ...T.caption,
    color: C.textSecondary,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: S.lg,
    marginVertical: S.lg,
  },
  sideControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  timerBadge: {
    position: 'absolute',
    bottom: -2,
    fontSize: 9,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    position: 'relative',
  },
  skipSecText: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '800',
    color: C.textPrimary,
    marginTop: 1,
  },
  primaryPlayButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  chaptersSection: {
    paddingHorizontal: 0,
    marginTop: S.lg,
  },
  sectionHeader: {
    ...T.micro,
    color: C.textSecondary,
    marginBottom: S.md,
    paddingHorizontal: S.h,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingVertical: 14,
    paddingHorizontal: S.h,
    width: '100%',
  },
  chapterRowActive: {
    borderRadius: 0,
  },
  chapterTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  chapterTextActiveBold: {
    color: '#000000',
    fontWeight: '800',
  },
  chapterDurationActive: {
    color: 'rgba(0, 0, 0, 0.7)',
    fontWeight: '600',
  },
  chapterPlayBtnActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  chapterNumBox: {
    width: 26,
    alignItems: 'center',
    marginRight: S.sm,
  },
  chapterNumText: {
    ...T.caption,
    color: C.textSecondary,
    fontWeight: '600',
  },
  chapterInfo: {
    flex: 1,
    marginRight: S.sm,
  },
  chapterTitle: {
    ...T.body,
    color: C.textPrimary,
    marginBottom: 2,
  },
  chapterDuration: {
    ...T.caption,
    color: C.textSecondary,
  },
  chapterPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    ...T.body,
    color: C.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  speedSheet: {
    backgroundColor: C.bgSheet,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    padding: S.xl,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalSheetTitle: {
    ...T.screenTitle,
    color: C.textPrimary,
    marginBottom: S.xs,
  },
  modalSheetSubtitle: {
    ...T.caption,
    color: C.textSecondary,
    marginBottom: S.lg,
  },
  speedOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: S.md,
  },
  speedOptionBtn: {
    width: (SCREEN_WIDTH - S.xl * 2 - 40) / 5,
    paddingVertical: 12,
    backgroundColor: C.bgOption,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  speedOptionText: {
    ...T.captionStrong,
    color: C.textPrimary,
  },
  sleepSheet: {
    backgroundColor: C.bgSheet,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    padding: S.xl,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: C.border,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.bgOption,
    paddingVertical: 14,
    paddingHorizontal: S.lg,
    borderRadius: R.md,
    marginBottom: S.sm,
    borderWidth: 1,
    borderColor: C.borderFaint,
  },
  sheetOptionText: {
    ...T.body,
    color: C.textPrimary,
  },
  turnOffTimerBtn: {
    marginTop: S.sm,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: R.md,
    backgroundColor: C.dangerBg,
    borderWidth: 1,
    borderColor: C.dangerBorder,
  },
  turnOffTimerText: {
    ...T.bodyStrong,
    color: C.danger,
  },
  bookmarksSheet: {
    backgroundColor: C.bgSheet,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    padding: S.xl,
    maxHeight: '75%',
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: C.border,
  },
  bookmarksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: S.md,
  },
  closeSheetBtn: {
    padding: 6,
  },
  bookmarksList: {
    marginTop: S.xs,
  },
  emptyBookmarksText: {
    ...T.caption,
    color: C.textSecondary,
    textAlign: 'center',
    paddingVertical: 30,
  },
  bookmarkCard: {
    backgroundColor: C.bgOption,
    borderRadius: R.md,
    padding: S.md,
    marginBottom: S.sm,
    borderWidth: 1,
    borderColor: C.borderFaint,
  },
  bookmarkMain: {
    marginBottom: 6,
  },
  bookmarkTime: {
    ...T.captionStrong,
    marginBottom: 2,
  },
  bookmarkNote: {
    ...T.caption,
    color: C.textMuted,
  },
  bookmarkActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  bmActionBtn: {
    padding: 6,
  },
  editNoteRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  editNoteInput: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderRadius: R.xs,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: C.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: C.border,
  },
  saveNoteBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: R.xs,
  },
  saveNoteBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 12,
  },
});
