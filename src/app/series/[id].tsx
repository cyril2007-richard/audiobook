import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getSeriesById } from '../../db';
import { usePlayer } from '../../hooks/use-player';
import { SeriesWithBooks, BookWithDetails } from '../../types';
import { CoverImage } from '../../components/cover-image';
import { Icon } from '../../components/icon';

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { resumeSeries } = usePlayer();

  const [series] = useState<SeriesWithBooks | null>(() => (id ? getSeriesById(id) : null));

  if (!series) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Series not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleContinueSeries = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await resumeSeries(series.id);
    router.push('/player' as any);
  };

  const completedPercent =
    series.books.length > 0
      ? Math.round((series.completed_books_count / series.books.length) * 100)
      : 0;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Top Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon name="chevron-left" size={16} color="#F59E0B" style={{ marginRight: 4 }} />
          <Text style={styles.backText}>Library</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Hero */}
        <View style={styles.headerHero}>
          <CoverImage
            uri={series.cover_path}
            title={series.name}
            size={160}
            borderRadius={18}
            style={styles.seriesCover}
          />

          <Text style={styles.seriesTitle}>{series.name}</Text>
          <Text style={styles.seriesStats}>
            {series.books.length} {series.books.length === 1 ? 'Book' : 'Books'} •{' '}
            {series.completed_books_count} Completed ({completedPercent}%)
          </Text>

          {/* Overall Progress Bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${completedPercent}%` }]} />
          </View>

          {/* Continue Series Action Button */}
          <TouchableOpacity
            style={styles.continueButton}
            activeOpacity={0.85}
            onPress={handleContinueSeries}
          >
            <Icon name="play" size={14} color="#000000" style={{ marginRight: 8 }} />
            <Text style={styles.continueButtonText}>Continue Series</Text>
          </TouchableOpacity>
        </View>

        {/* Ordered Book List */}
        <View style={styles.booksSection}>
          <Text style={styles.sectionHeading}>BOOKS IN SERIES</Text>

          {series.books.map((book: BookWithDetails, idx: number) => {
            const isCompleted = book.finished === 1;
            const hasStarted = book.position_ms && book.position_ms > 0;

            return (
              <TouchableOpacity
                key={book.id}
                style={styles.bookRow}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/book/${book.id}` as any);
                }}
              >
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{book.series_order ?? idx + 1}</Text>
                </View>

                <CoverImage
                  uri={book.cover_path}
                  title={book.title}
                  author={book.author}
                  size={58}
                  borderRadius={10}
                  style={styles.bookThumb}
                />

                <View style={styles.bookRowDetails}>
                  <Text style={styles.bookRowTitle} numberOfLines={1}>
                    {book.title}
                  </Text>
                  {book.author ? (
                    <Text style={styles.bookRowAuthor} numberOfLines={1}>
                      {book.author}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.bookStatus,
                      isCompleted && styles.bookStatusCompleted,
                    ]}
                  >
                    {isCompleted
                      ? '✓ Completed'
                      : hasStarted
                      ? 'In progress'
                      : 'Not started'}
                  </Text>
                </View>

                <Icon name="chevron-right" size={14} color="#6B7280" />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 110,
  },
  headerHero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 24,
  },
  seriesCover: {
    marginBottom: 16,
  },
  seriesTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  seriesStats: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 14,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: '#1E2330',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#F59E0B',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  booksSection: {
    paddingHorizontal: 18,
    marginTop: 8,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151820',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  orderBadge: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  orderBadgeText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
  },
  bookThumb: {
    marginRight: 12,
  },
  bookRowDetails: {
    flex: 1,
  },
  bookRowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  bookRowAuthor: {
    color: '#8E8E93',
    fontSize: 12,
    marginBottom: 4,
  },
  bookStatus: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
  },
  bookStatusCompleted: {
    color: '#10B981',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: '#8E8E93',
    fontSize: 16,
  },
});
