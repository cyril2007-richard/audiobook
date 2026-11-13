import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Dimensions,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getAllBooks, getAllSeries } from '../../db';
import { getSavedLibraryDirectory, requestLibraryDirectory } from '../../services/saf';
import { scanLibrary, isScanInProgress } from '../../services/scanner';
import { useSidecarCache } from '../../hooks/use-sidecar-cache';
import { BookWithDetails, SeriesWithBooks } from '../../types';
import { CoverImage } from '../../components/cover-image';
import { Icon } from '../../components/icon';
import { C, R, S, T, SCROLL_BOTTOM_INSET } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 18;
const GRID_GAP = 16;
const ITEM_WIDTH = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2);
const ITEM_HEIGHT = Math.round(ITEM_WIDTH * 1.46);

type FilterType = 'all' | 'in_progress' | 'finished' | 'series' | 'not_started';
type SortType = 'recent' | 'title' | 'date_added';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'finished', label: 'Finished' },
  { key: 'series', label: 'Series' },
  { key: 'not_started', label: 'Not Started' },
];

export default function LibraryTabScreen() {
  const router = useRouter();

  const [books, setBooks] = useState<BookWithDetails[]>(() => getAllBooks());
  const [seriesList, setSeriesList] = useState<SeriesWithBooks[]>(() => getAllSeries());
  const [refreshing, setRefreshing] = useState(false);
  const [hasFolder, setHasFolder] = useState(() => !!getSavedLibraryDirectory());

  const { getSidecar, refreshAll } = useSidecarCache(books);

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('recent');

  const refreshData = useCallback(() => {
    setBooks(getAllBooks());
    setSeriesList(getAllSeries());
    setHasFolder(!!getSavedLibraryDirectory());
  }, []);

  const handleRefresh = async () => {
    const folderUri = getSavedLibraryDirectory();
    if (folderUri && !isScanInProgress()) {
      setRefreshing(true);
      await scanLibrary(folderUri);
      setRefreshing(false);
      refreshData();
      await refreshAll();
    }
  };

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

  const isSeriesMode = filter === 'series';

  const filteredBooks = useMemo(() => {
    let result = [...books];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.author && b.author.toLowerCase().includes(q))
      );
    }

    if (filter === 'in_progress') {
      result = result.filter((b) => {
        const sc = getSidecar(b.path);
        return sc.loaded && sc.progress && sc.progress.position_ms > 0 && sc.progress.finished !== 1;
      });
    } else if (filter === 'finished') {
      result = result.filter((b) => {
        const sc = getSidecar(b.path);
        return sc.loaded && sc.progress && sc.progress.finished === 1;
      });
    } else if (filter === 'not_started') {
      result = result.filter((b) => {
        const sc = getSidecar(b.path);
        return !sc.progress || sc.progress.position_ms === 0;
      });
    }

    if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'date_added') {
      result.sort((a, b) => b.added_at - a.added_at);
    } else {
      result.sort((a, b) => {
        const scA = getSidecar(a.path);
        const scB = getSidecar(b.path);
        const timeA = scA.progress?.updated_at || a.added_at || 0;
        const timeB = scB.progress?.updated_at || b.added_at || 0;
        return timeB - timeA;
      });
    }

    return result;
  }, [books, searchQuery, filter, sortBy, getSidecar]);

  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return seriesList;
    const q = searchQuery.toLowerCase();
    return seriesList.filter((s) => s.name.toLowerCase().includes(q));
  }, [seriesList, searchQuery]);

  const cycleSort = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next: SortType =
      sortBy === 'recent' ? 'title' : sortBy === 'title' ? 'date_added' : 'recent';
    setSortBy(next);
  };

  const sortLabel = sortBy === 'recent' ? 'Recent' : sortBy === 'title' ? 'Title' : 'Date Added';

  // Apple Books Grid Item
  const renderBookItem = ({ item }: { item: BookWithDetails }) => {
    const sc = getSidecar(item.path);
    const posMs = sc.progress?.position_ms ?? 0;
    const isFinished = sc.progress?.finished === 1;
    const progress =
      item.duration && item.duration > 0 && posMs
        ? Math.min(100, ((posMs / 1000) / item.duration) * 100)
        : 0;

    return (
      <TouchableOpacity
        style={styles.bookCard}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/book/${item.id}` as any);
        }}
      >
        <View style={styles.coverWrapper}>
          <CoverImage
            uri={item.cover_path}
            title={item.title}
            author={item.author}
            width={ITEM_WIDTH}
            height={ITEM_HEIGHT}
            borderRadius={8}
            style={styles.bookCoverShadow}
          />

          {/* Micro progress line across the bottom */}
          {progress > 0 && !isFinished && (
            <View style={styles.cardProgressTrack}>
              <View style={[styles.cardProgressFill, { width: `${progress}%` }]} />
            </View>
          )}

          {/* Finished badge */}
          {isFinished && (
            <View style={styles.finishedBadge}>
              <Icon name="check" size={10} color="#FFFFFF" />
            </View>
          )}
        </View>

        <Text style={styles.bookCardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.author ? (
          <Text style={styles.bookCardAuthor} numberOfLines={1}>
            {item.author}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  // Apple Books Series Item
  const renderSeriesItem = ({ item }: { item: SeriesWithBooks }) => (
    <TouchableOpacity
      style={styles.seriesRow}
      activeOpacity={0.75}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/series/${item.id}` as any);
      }}
    >
      <CoverImage
        uri={item.cover_path}
        title={item.name}
        width={56}
        height={82}
        borderRadius={6}
        style={styles.seriesThumb}
      />
      <View style={styles.seriesInfo}>
        <Text style={styles.seriesName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.seriesMeta}>
          {item.books.length} {item.books.length === 1 ? 'Audiobook' : 'Audiobooks'} •{' '}
          {item.completed_books_count} Completed
        </Text>
        {item.books.length > 0 && (
          <View style={styles.seriesProgressTrack}>
            <View
              style={[
                styles.seriesProgressFill,
                { width: `${Math.round((item.completed_books_count / item.books.length) * 100)}%` },
              ]}
            />
          </View>
        )}
      </View>
      <Icon name="chevron-right" size={16} color={C.textTertiary} />
    </TouchableOpacity>
  );

  const ListHeader = (
    <View style={styles.headerArea}>
      {/* Search Capsule */}
      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={C.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your books..."
          placeholderTextColor={C.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={14} color={C.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Apple-style Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPillsScroll}
      >
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterPill,
                isActive && styles.filterPillActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilter(f.key);
              }}
            >
              <Text
                style={[
                  styles.filterPillText,
                  isActive && styles.filterPillTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Understated Sort & Count Bar */}
      <View style={styles.sortBar}>
        <Text style={styles.itemCountText}>
          {isSeriesMode
            ? `${filteredSeries.length} ${filteredSeries.length === 1 ? 'Series' : 'Series'}`
            : `${filteredBooks.length} ${filteredBooks.length === 1 ? 'Book' : 'Books'}`}
        </Text>

        {!isSeriesMode && (
          <TouchableOpacity style={styles.sortTrigger} onPress={cycleSort}>
            <Text style={styles.sortTriggerText}>Sort: {sortLabel}</Text>
            <Icon name="chevron-down" size={12} color={C.textSecondary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const EmptyState = (
    <View style={styles.emptyContainer}>
      {!hasFolder ? (
        <>
          <View style={styles.emptyIconCircle}>
            <Icon name="book" size={32} color={C.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Your Library is Empty</Text>
          <Text style={styles.emptySubtitle}>
            Select your audiobooks folder on your phone to add your collection.
          </Text>
          <TouchableOpacity style={styles.chooseFolderBtn} onPress={handlePickFolder}>
            <Text style={styles.chooseFolderBtnText}>Choose Folder</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.emptyIconCircle}>
            <Icon name="search" size={28} color={C.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No Audiobooks Found</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery ? `No results for "${searchQuery}"` : 'Pull down to refresh and rescan your folder.'}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Apple Books Large Navigation Header */}
      <View style={styles.largeTitleBar}>
        <Text style={styles.largeTitle}>Library</Text>
      </View>

      <FlatList
        data={(isSeriesMode ? filteredSeries : filteredBooks) as any}
        keyExtractor={(item: any) => item.id}
        numColumns={isSeriesMode ? 1 : 2}
        key={isSeriesMode ? 'series-list' : 'books-grid'}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={!isSeriesMode ? styles.columnWrapper : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
        ListHeaderComponent={ListHeader}
        renderItem={(isSeriesMode ? renderSeriesItem : renderBookItem) as any}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  largeTitleBar: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: S.xs,
    paddingBottom: 4,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.6,
  },
  headerArea: {
    marginTop: S.sm,
    marginBottom: S.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16181F',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 38,
    marginBottom: S.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
    padding: 0,
  },
  filterPillsScroll: {
    gap: 8,
    paddingBottom: S.md,
  },
  filterPill: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: '#16181F',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillActive: {
    backgroundColor: C.textPrimary,
    borderColor: C.textPrimary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  filterPillTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: S.lg,
  },
  itemCountText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textSecondary,
  },
  sortTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  sortTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textMuted,
  },
  listContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: SCROLL_BOTTOM_INSET,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  bookCard: {
    width: ITEM_WIDTH,
  },
  coverWrapper: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  bookCoverShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
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
    backgroundColor: C.accent,
  },
  finishedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: C.success,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
  bookCardTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 8,
    lineHeight: 18,
  },
  bookCardAuthor: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  seriesThumb: {
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  seriesInfo: {
    flex: 1,
  },
  seriesName: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  seriesMeta: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 6,
  },
  seriesProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: R.pill,
    width: '85%',
    overflow: 'hidden',
  },
  seriesProgressFill: {
    height: 3,
    backgroundColor: C.accent,
  },
  emptyContainer: {
    paddingVertical: 70,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#16181F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 19,
    marginBottom: 20,
  },
  chooseFolderBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  chooseFolderBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});
