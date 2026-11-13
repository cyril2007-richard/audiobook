import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '../hooks/use-player';
import { CoverImage } from '../components/cover-image';
import { Icon } from '../components/icon';
import { extractAccentColor } from '../services/palette';
import {
  getSetting,
  updateBookAccentColor,
} from '../db';
import {
  getBookmarks,
  deleteBookmark,
  updateBookmarkNote,
} from '../services/book-store';
import { Bookmark } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

export default function NowPlayingScreen() {
  const router = useRouter();
  const {
    currentBook,
    currentChapter,
    isPlaying,
    position,
    duration,
    speed,
    sleepTimer,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    nextChapter,
    previousChapter,
    setPlaybackSpeed,
    setSleepTimer,
    clearSleepTimer,
    createQuickBookmark,
  } = usePlayer();

  const [accentColor, setAccentColor] = useState<string>(
    () => currentBook?.accent_color || '#F59E0B'
  );
  const [speedModalVisible, setSpeedModalVisible] = useState(false);
  const [sleepModalVisible, setSleepModalVisible] = useState(false);
  const [bookmarksModalVisible, setBookmarksModalVisible] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    if (currentBook?.accent_color) {
      setAccentColor(currentBook.accent_color);
      return;
    }

    if (currentBook?.cover_path && currentBook?.id) {
      extractAccentColor(currentBook.cover_path).then((color) => {
        if (isMounted && color) {
          setAccentColor(color);
          updateBookAccentColor(currentBook.id, color);
        }
      });
    } else {
      setAccentColor('#F59E0B');
    }
    return () => {
      isMounted = false;
    };
  }, [currentBook?.id, currentBook?.cover_path, currentBook?.accent_color]);

  const refreshBookmarks = useCallback(async () => {
    if (currentBook?.path) {
      const bms = await getBookmarks(currentBook.path);
      setBookmarks(bms as Bookmark[]);
    }
  }, [currentBook?.path]);

  useEffect(() => {
    refreshBookmarks();
  }, [refreshBookmarks]);

  if (!currentBook) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No audiobook currently loaded.</Text>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => router.back()}>
            <Text style={styles.dismissBtnText}>Go to Library</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progressPercent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const remainingTime = Math.max(0, duration - position);

  const handleQuickBookmark = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    createQuickBookmark();
    refreshBookmarks();
    setBookmarksModalVisible(true);
  };

  const handleSeekBarPress = (e: any) => {
    const { locationX } = e.nativeEvent;
    const barWidth = SCREEN_WIDTH - 48;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    const targetSeconds = ratio * duration;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    seekTo(targetSeconds);
  };

  const skipForwardSec = parseInt(getSetting('skip_forward_duration', '30') || '30', 10);
  const skipBackwardSec = parseInt(getSetting('skip_backward_duration', '15') || '15', 10);

  return (
    <View style={styles.container}>
      {/* Apple Music Style Blurred Backdrop */}
      {currentBook.cover_path && (
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: currentBook.cover_path }}
            style={styles.backdropImage}
            contentFit="cover"
          />
          <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.darkGradientOverlay} />
        </View>
      )}

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {/* Top Dismiss Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.collapseButton}
            onPress={() => router.back()}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Icon name="chevron-down" size={18} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Main Artwork */}
        <View style={styles.artworkContainer}>
          <CoverImage
            uri={currentBook.cover_path}
            title={currentBook.title}
            author={currentBook.author}
            size={SCREEN_WIDTH * 0.78}
            borderRadius={22}
            style={[
              styles.artworkShadow,
              { shadowColor: accentColor },
            ]}
          />
        </View>

        {/* Metadata Titles */}
        <View style={styles.titleContainer}>
          <Text style={styles.bookTitle} numberOfLines={1}>
            {currentBook.title}
          </Text>
          <Text style={styles.chapterTitle} numberOfLines={1}>
            {currentChapter?.title || 'Chapter'}
          </Text>
          {currentBook.author ? (
            <Text style={styles.authorTitle} numberOfLines={1}>
              {currentBook.author}
            </Text>
          ) : null}
        </View>

        {/* Progress / Seek Bar */}
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

          <View style={styles.timeLabels}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>-{formatTime(remainingTime)}</Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsRow}>
          {/* Previous Chapter */}
          <TouchableOpacity
            style={styles.secondaryControl}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              previousChapter();
            }}
          >
            <Icon name="prev" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Skip Backward */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              skipBackward(skipBackwardSec);
            }}
          >
            <Text style={styles.skipBadgeNum}>{skipBackwardSec}</Text>
            <Text style={styles.skipLabel}>REWIND</Text>
          </TouchableOpacity>

          {/* Large Center Play / Pause */}
          <TouchableOpacity
            style={[styles.primaryPlayButton, { backgroundColor: accentColor }]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              togglePlayPause();
            }}
          >
            <Icon
              name={isPlaying ? 'pause' : 'play'}
              size={26}
              color="#000000"
            />
          </TouchableOpacity>

          {/* Skip Forward */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              skipForward(skipForwardSec);
            }}
          >
            <Text style={styles.skipBadgeNum}>{skipForwardSec}</Text>
            <Text style={styles.skipLabel}>FORWARD</Text>
          </TouchableOpacity>

          {/* Next Chapter */}
          <TouchableOpacity
            style={styles.secondaryControl}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              nextChapter();
            }}
          >
            <Icon name="next" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Bottom Utility Bar: Speed, Sleep, Bookmarks */}
        <View style={styles.utilityBar}>
          {/* Speed Button */}
          <TouchableOpacity
            style={styles.utilityButton}
            onPress={() => setSpeedModalVisible(true)}
          >
            <Text style={[styles.utilityButtonText, { color: accentColor }]}>
              {speed.toFixed(2).replace(/\.00$/, '')}x
            </Text>
          </TouchableOpacity>

          {/* Sleep Timer */}
          <TouchableOpacity
            style={styles.utilityButton}
            onPress={() => setSleepModalVisible(true)}
          >
            <Icon
              name="timer"
              size={14}
              color={sleepTimer.durationMinutes ? accentColor : '#8E8E93'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.utilityButtonText,
                sleepTimer.durationMinutes ? { color: accentColor } : undefined,
              ]}
            >
              {sleepTimer.remainingSeconds !== null
                ? `${Math.ceil(sleepTimer.remainingSeconds / 60)}m`
                : sleepTimer.durationMinutes === 'end_of_chapter'
                ? 'End Ch'
                : 'Sleep'}
            </Text>
          </TouchableOpacity>

          {/* Bookmark Button */}
          <TouchableOpacity
            style={styles.utilityButton}
            onPress={handleQuickBookmark}
          >
            <Icon name="bookmark" size={13} color="#8E8E93" style={{ marginRight: 6 }} />
            <Text style={styles.utilityButtonText}>
              Bookmark{bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

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
              Audio will smoothly fade out over 20 seconds before pausing.
            </Text>

            {[15, 30, 60].map((mins) => (
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
                <Icon name="close" size={14} color="#8E8E93" />
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
                            placeholderTextColor="#6B7280"
                            autoFocus
                          />
                          <TouchableOpacity
                            style={[
                              styles.saveNoteBtn,
                              { backgroundColor: accentColor },
                            ]}
                            onPress={async () => {
                              if (currentBook?.path) {
                                await updateBookmarkNote(currentBook.path, bm.id, editingNote);
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
                            <Icon name="edit" size={14} color="#8E8E93" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              if (currentBook?.path) {
                                await deleteBookmark(currentBook.path, bm.id);
                              }
                              refreshBookmarks();
                            }}
                            style={styles.bmActionBtn}
                          >
                            <Icon name="trash" size={14} color="#8E8E93" />
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
    backgroundColor: '#000000',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
    opacity: 0.35,
  },
  darkGradientOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.75)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  topBar: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  collapseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  artworkShadow: {
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  },
  titleContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  bookTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  chapterTitle: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 2,
  },
  authorTitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  seekSection: {
    width: '100%',
    marginVertical: 8,
  },
  seekTouchArea: {
    paddingVertical: 12,
  },
  seekTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 2,
    position: 'relative',
  },
  seekFill: {
    height: 4,
    borderRadius: 2,
  },
  seekThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timeText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginVertical: 8,
  },
  secondaryControl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  skipBadgeNum: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  skipLabel: {
    color: '#8E8E93',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  primaryPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  utilityBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  utilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  utilityButtonText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  speedSheet: {
    backgroundColor: '#181C26',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalSheetTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalSheetSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    marginBottom: 16,
  },
  speedOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  speedOptionBtn: {
    width: (SCREEN_WIDTH - 48 - 40) / 5,
    paddingVertical: 12,
    backgroundColor: '#232938',
    borderRadius: 12,
    alignItems: 'center',
  },
  speedOptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  sleepSheet: {
    backgroundColor: '#181C26',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#202534',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  sheetOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  turnOffTimerBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#351F1F',
  },
  turnOffTimerText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 14,
  },
  bookmarksSheet: {
    backgroundColor: '#181C26',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  bookmarksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  closeSheetBtn: {
    padding: 6,
  },
  bookmarksList: {
    marginTop: 4,
  },
  emptyBookmarksText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  bookmarkCard: {
    backgroundColor: '#202534',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  bookmarkMain: {
    marginBottom: 6,
  },
  bookmarkTime: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  bookmarkNote: {
    color: '#D1D5DB',
    fontSize: 13,
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
    backgroundColor: '#12141A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  saveNoteBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 8,
  },
  saveNoteBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 16,
    marginBottom: 16,
  },
  dismissBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  dismissBtnText: {
    color: '#000000',
    fontWeight: '700',
  },
});
