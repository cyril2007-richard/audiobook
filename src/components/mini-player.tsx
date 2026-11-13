import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '../hooks/use-player';
import { CoverImage } from './cover-image';
import { Icon } from './icon';
import { C, R, S } from '../constants/theme';

export const MiniPlayer: React.FC = () => {
  const router = useRouter();
  const {
    currentBook,
    currentChapter,
    isPlaying,
    togglePlayPause,
    skipForward,
    position,
    duration,
  } = usePlayer();

  if (!currentBook) return null;

  const progressPercent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const handleOpenNowPlaying = () => {
    if (!currentBook?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/book/${currentBook.id}` as any);
  };

  const handleTogglePlay = (e: any) => {
    e.stopPropagation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    togglePlayPause();
  };

  const handleSkipForward = (e: any) => {
    e.stopPropagation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skipForward(30);
  };

  return (
    <View style={styles.floatingContainer}>
      <Pressable style={styles.pillCard} onPress={handleOpenNowPlaying}>
        {/* Progress Background Fill from left to right */}
        {progressPercent > 0 && (
          <View
            style={[
              styles.backgroundProgressFill,
              { width: `${progressPercent}%` },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Artwork */}
        <CoverImage
          uri={currentBook.cover_path}
          title={currentBook.title}
          size={44}
          borderRadius={R.sm}
          style={styles.cover}
        />

        {/* Text info */}
        <View style={styles.textContainer}>
          <Text style={styles.bookTitle} numberOfLines={1}>
            {currentBook.title}
          </Text>
          <Text style={styles.chapterTitle} numberOfLines={1}>
            {currentChapter?.title || 'Now Playing'}
          </Text>
        </View>

        {/* Skip Forward 30s */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleSkipForward}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Icon name="next" size={16} color={C.textMuted} />
        </TouchableOpacity>

        {/* Play/Pause Button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={handleTogglePlay}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={16} color="#000000" />
        </TouchableOpacity>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    paddingHorizontal: S.md,
    paddingBottom: S.sm,
    paddingTop: S.xs,
    backgroundColor: 'transparent',
  },
  pillCard: {
    backgroundColor: '#1C1F2A',
    borderRadius: R.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.sm,
    paddingVertical: S.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundProgressFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255, 255, 255, 0.28)',
  },
  cover: {
    marginRight: S.md,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: S.sm,
  },
  bookTitle: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  chapterTitle: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: R.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

