import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  getAllBooks,
  getAllSeries,
} from '../../db';
import {
  getSavedLibraryDirectory,
  requestLibraryDirectory,
} from '../../services/saf';
import {
  scanLibrary,
  subscribeScanProgress,
  isScanInProgress,
} from '../../services/scanner';
import { usePlayer } from '../../hooks/use-player';
import { useSidecarCache } from '../../hooks/use-sidecar-cache';
import { BookWithDetails, SeriesWithBooks } from '../../types';
import { CoverImage } from '../../components/cover-image';
import { Icon } from '../../components/icon';
import { C, R, S, T, SCROLL_BOTTOM_INSET } from '../../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.70);
const BOOK_CARD_WIDTH = 145;
const BOOK_CARD_HEIGHT = Math.round(BOOK_CARD_WIDTH * 1.48); // Standard 1:1.48 book cover aspect ratio

function formatDuration(ms: number | undefined | null): string {
  if (!ms || ms <= 0) return '0m';
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loadBook, play, currentBook, isPlaying, resumeSeries } = usePlayer();

  const [hasFolder, setHasFolder] = useState<boolean>(() => !!getSavedLibraryDirectory());
  const [books, setBooks] = useState<BookWithDetails[]>(() => getAllBooks());
  const [seriesList, setSeriesList] = useState<SeriesWithBooks[]>(() => getAllSeries());
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('');

  // Load progress from per-book sidecar files
  const { getSidecar, refreshAll } = useSidecarCache(books);

  const refreshData = useCallback(() => {
    setHasFolder(!!getSavedLibraryDirectory());
    setBooks(getAllBooks());
    setSeriesList(getAllSeries());
  }, []);

  useEffect(() => {
    const unsub = subscribeScanProgress((event) => {
      setScanning(event.status === 'scanning');
      if (event.status === 'scanning') {
        setScanMessage(event.currentFolder ? `Scanning ${event.currentFolder}...` : 'Scanning library...');
      } else {
        setScanMessage('');
        refreshData();
        refreshAll();
      }
    });

    const folderUri = getSavedLibraryDirectory();
    if (folderUri && !isScanInProgress()) {
      scanLibrary(folderUri);
    }

    return unsub;
  }, [refreshData, refreshAll]);

  const handlePickFolder = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const uri = await requestLibraryDirectory();
    if (uri) {
      setHasFolder(true);
      await scanLibrary(uri);
      refreshData();
      await refreshAll();
    }
  };

  const handleManualRescan = async () => {
    const folderUri = getSavedLibraryDirectory();
    if (folderUri && !scanning) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await scanLibrary(folderUri);
      refreshData();
      await refreshAll();
    }
  };

  const handleResumeRecent = async (targetBook: BookWithDetails) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (currentBook?.id === targetBook.id) {
      if (!isPlaying) play();
    } else {
      await loadBook(targetBook.id);
      play();
    }
    router.push(`/book/${targetBook.id}` as any);
  };

  // Derive in-progress and recent book from sidecar data
  const inProgressBooks = books.filter((b) => {
    const sc = getSidecar(b.path);
    return sc.loaded && sc.progress && sc.progress.position_ms > 0 && sc.progress.finished !== 1;
  });

  // Most recently played book (by sidecar updated_at)
  const recentBook = books
    .map((b) => ({ book: b, sc: getSidecar(b.path) }))
    .filter(({ sc }) => sc.loaded && sc.progress && sc.progress.finished !== 1)
    .sort((a, b) => (b.sc.progress?.updated_at ?? 0) - (a.sc.progress?.updated_at ?? 0))[0]?.book ?? null;

  const recentlyAddedBooks = [...books].sort((a, b) => b.added_at - a.added_at).slice(0, 8);

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ backgroundColor: '#000000' }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={scanning} onRefresh={handleManualRescan} tintColor="#FFFFFF" />
        }
      >
        {/* 70% Hero Screen Section */}
        <View style={[styles.heroViewport, { height: HERO_HEIGHT, paddingTop: insets.top }]}>
          {/* Blurred Cover Backdrop */}
          {recentBook?.cover_path ? (
            <View style={StyleSheet.absoluteFill}>
              <Image
                source={{ uri: recentBook.cover_path }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)', '#000000']}
                locations={[0, 0.65, 1]}
                style={StyleSheet.absoluteFill}
              />
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0C' }]} />
          )}

          {/* Top Bar inside Hero */}
          <View style={styles.heroTopBar}>
            <View>
              <Text style={styles.appTitle}>Listen Now</Text>
              <Text style={styles.heroSubheading}>Continue from where you left off</Text>
            </View>

            <View style={styles.headerActions}>
              {scanning ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <TouchableOpacity onPress={handleManualRescan} style={styles.headerIconButton} activeOpacity={0.7}>
                  <Icon name="refresh" size={16} color={C.textPrimary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Centered Last Book in the 70% Hero */}
          {recentBook ? (
            <View style={styles.heroCenterContent}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => handleResumeRecent(recentBook)}
                style={styles.heroCenterCard}
              >
                <CoverImage
                  uri={recentBook.cover_path}
                  title={recentBook.title}
                  author={recentBook.author}
                  size={Math.round(SCREEN_WIDTH * 0.52)}
                  borderRadius={R.lg}
                  style={styles.heroArtworkShadow}
                />

                <View style={styles.heroCenterInfo}>
                  <Text style={styles.heroCenterTitle} numberOfLines={2}>
                    {recentBook.title}
                  </Text>
                  {recentBook.author ? (
                    <Text style={styles.heroCenterAuthor} numberOfLines={1}>
                      {recentBook.author}
                    </Text>
                  ) : null}
                  <Text style={styles.heroCenterChapter} numberOfLines={1}>
                    {getSidecar(recentBook.path).progress ? 'In Progress' : 'Not Started'}
                  </Text>

                  <TouchableOpacity
                    style={styles.heroResumeBtn}
                    activeOpacity={0.8}
                    onPress={() => handleResumeRecent(recentBook)}
                  >
                    <Icon
                      name={currentBook?.id === recentBook.id && isPlaying ? 'pause' : 'play'}
                      size={14}
                      color="#000000"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.heroResumeBtnText}>
                      {currentBook?.id === recentBook.id && isPlaying ? 'Playing' : 'Resume'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.heroCenterContent}>
              <View style={styles.noRecentBox}>
                <Icon name="book" size={38} color={C.textTertiary} />
                <Text style={styles.noRecentTitle}>Your Audiobooks</Text>
                <Text style={styles.noRecentSubtitle}>Select an audiobook below to start listening</Text>
              </View>
            </View>
          )}
        </View>

        {/* First Launch Folder Prompt */}
        {!hasFolder && (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Select Audiobooks Folder</Text>
            <Text style={styles.setupSubtitle}>
              Lumen plays your audiobooks directly in place without copying. Choose your folder to get started.
            </Text>
            <TouchableOpacity style={styles.setupButton} onPress={handlePickFolder} activeOpacity={0.85}>
              <Text style={styles.setupButtonText}>Choose Folder</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scanning status banner */}
        {scanning && (
          <View style={styles.scanningBanner}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.scanningText} numberOfLines={1}>
              {scanMessage || 'Scanning audiobooks...'}
            </Text>
          </View>
        )}

          {/* Jump Back In (Horizontal carousel of in-progress books) */}
          {inProgressBooks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>JUMP BACK IN</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {inProgressBooks.map((b) => {
                  const bProgress = getSidecar(b.path).progress;
                  const posMs = bProgress?.position_ms ?? 0;
                  const prog =
                    b.duration && b.duration > 0 && posMs
                      ? Math.min(100, ((posMs / 1000) / b.duration) * 100)
                      : 0;
                  const isThisBookActive = currentBook?.id === b.id && isPlaying;
                  const timeSpent = formatDuration(posMs);

                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={styles.horizontalCard}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/book/${b.id}` as any);
                      }}
                    >
                      <View style={styles.horizontalCoverWrap}>
                        <CoverImage
                          uri={b.cover_path}
                          title={b.title}
                          author={b.author}
                          width={BOOK_CARD_WIDTH}
                          height={BOOK_CARD_HEIGHT}
                          borderRadius={R.md}
                        />

                        {/* Bottom-left pill containing play/pause and time into chapter */}
                        <TouchableOpacity
                          style={styles.coverTimePill}
                          activeOpacity={0.8}
                          onPress={(e) => {
                            e.stopPropagation();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            if (currentBook?.id === b.id) {
                              play();
                            } else {
                              loadBook(b.id);
                              play();
                            }
                          }}
                        >
                          <Icon
                            name={isThisBookActive ? 'pause' : 'play'}
                            size={10}
                            color="#FFFFFF"
                            style={{ marginRight: 5 }}
                          />
                          <Text style={styles.coverTimePillText}>{timeSpent} in</Text>
                        </TouchableOpacity>

                        {/* Thin progress line across bottom */}
                        {prog > 0 && (
                          <View style={styles.cardProgressTrack}>
                            <View style={[styles.cardProgressFill, { width: `${prog}%` }]} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.horizontalCardTitle} numberOfLines={2}>
                        {b.title}
                      </Text>
                      {b.author ? (
                        <Text style={styles.horizontalCardAuthor} numberOfLines={1}>
                          {b.author}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

        {/* Series In Progress */}
        {seriesList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>SERIES IN PROGRESS</Text>
            {seriesList.map((s) => {
              const compPercent =
                s.books.length > 0
                  ? Math.round((s.completed_books_count / s.books.length) * 100)
                  : 0;

              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.seriesCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/series/${s.id}` as any);
                  }}
                >
                  <CoverImage
                    uri={s.cover_path}
                    title={s.name}
                    size={72}
                    borderRadius={14}
                    style={{ marginRight: 14 }}
                  />
                  <View style={styles.seriesDetails}>
                    <Text style={styles.seriesName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={styles.seriesStats}>
                      {s.books.length} Books • {s.completed_books_count} Completed
                    </Text>
                    {/* Progress track */}
                    <View style={styles.seriesProgressTrack}>
                      <View style={[styles.seriesProgressFill, { width: `${compPercent}%` }]} />
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.seriesPlayBtn}
                    onPress={async (e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      await resumeSeries(s.id);
                    }}
                  >
                    <Icon name="play" size={14} color="#000000" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Recently Added Books */}
        {recentlyAddedBooks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>RECENTLY ADDED</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
              {recentlyAddedBooks.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.horizontalCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/book/${b.id}` as any);
                  }}
                >
                  <View style={styles.horizontalCoverWrap}>
                    <CoverImage
                      uri={b.cover_path}
                      title={b.title}
                      author={b.author}
                      width={BOOK_CARD_WIDTH}
                      height={BOOK_CARD_HEIGHT}
                      borderRadius={R.md}
                    />
                  </View>
                  <Text style={styles.horizontalCardTitle} numberOfLines={2}>
                    {b.title}
                  </Text>
                  {b.author ? (
                    <Text style={styles.horizontalCardAuthor} numberOfLines={1}>
                      {b.author}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  heroViewport: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  heroTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: S.xl,
    paddingTop: S.md,
    zIndex: 2,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.6,
  },
  heroSubheading: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    marginTop: 2,
  },
  heroCenterContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: S.xl,
    zIndex: 2,
  },
  heroCenterCard: {
    alignItems: 'center',
    width: '100%',
  },
  heroArtworkShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 20,
    elevation: 16,
  },
  heroCenterInfo: {
    alignItems: 'center',
    marginTop: 18,
    width: '100%',
  },
  heroCenterTitle: {
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  heroCenterAuthor: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroCenterChapter: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
  },
  heroResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: R.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  heroResumeBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  noRecentBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: S.xl,
  },
  noRecentTitle: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  noRecentSubtitle: {
    color: C.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: R.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  scrollContent: {
    paddingBottom: SCROLL_BOTTOM_INSET,
    backgroundColor: C.bg,
  },
  setupCard: {
    marginHorizontal: S.h,
    marginVertical: S.md,
    padding: S.xl,
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  setupTitle: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  setupSubtitle: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  setupButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: R.sm,
    alignSelf: 'flex-start',
  },
  setupButtonText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 14,
  },
  scanningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: S.h,
    borderRadius: R.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  scanningText: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
    flex: 1,
  },
  heroSection: {
    paddingHorizontal: S.h,
    marginTop: S.lg,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  heroCard: {
    flexDirection: 'row',
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  heroCoverShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  heroDetails: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  heroTitle: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  heroChapter: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  heroAuthor: {
    color: C.textTertiary,
    fontSize: 12,
    marginBottom: 10,
  },
  resumeRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  resumePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: R.pill,
  },
  resumePillText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    marginTop: S.xl,
    paddingHorizontal: S.h,
  },
  horizontalScroll: {
    gap: 14,
    paddingRight: S.h,
  },
  horizontalCard: {
    width: BOOK_CARD_WIDTH,
  },
  horizontalCoverWrap: {
    width: BOOK_CARD_WIDTH,
    height: BOOK_CARD_HEIGHT,
    position: 'relative',
    borderRadius: R.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  coverTimePill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  coverTimePillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cardProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  cardProgressFill: {
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  horizontalCardTitle: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 17,
  },
  horizontalCardAuthor: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  seriesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  seriesDetails: {
    flex: 1,
  },
  seriesName: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  seriesStats: {
    color: C.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  seriesProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 1.5,
    width: '90%',
    overflow: 'hidden',
  },
  seriesProgressFill: {
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  seriesPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: R.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
