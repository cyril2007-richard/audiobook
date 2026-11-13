import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './icon';

interface CoverImageProps {
  uri: string | null | undefined;
  title: string;
  author?: string | null;
  size?: number;
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const CoverImage: React.FC<CoverImageProps> = ({
  uri,
  title,
  author,
  size,
  width,
  height,
  borderRadius = 14,
  style,
}) => {
  const finalWidth = size !== undefined ? size : width !== undefined ? width : '100%';
  const finalHeight = size !== undefined ? size : height !== undefined ? height : 180;

  if (uri) {
    return (
      <View
        style={[
          styles.container,
          { width: finalWidth as any, height: finalHeight, borderRadius },
          style,
        ]}
      >
        <Image
          source={{ uri }}
          style={[styles.image, { borderRadius }]}
          contentFit="cover"
          transition={250}
          cachePolicy="disk"
        />
        <View style={[styles.innerBorder, { borderRadius }]} pointerEvents="none" />
      </View>
    );
  }

  // Apple-style minimalist gradient card for books without artwork
  return (
    <View
      style={[
        styles.container,
        { width: finalWidth as any, height: finalHeight, borderRadius },
        style,
      ]}
    >
      <LinearGradient
        colors={['#2A2E3D', '#161922', '#0D0F14']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.fallbackGradient, { borderRadius }]}
      >
        <View style={styles.spineDeco} />

        <View style={styles.topIconBox}>
          <Icon name="book" size={18} color="rgba(255, 255, 255, 0.4)" />
        </View>

        <View style={styles.fallbackContent}>
          <Text style={styles.fallbackTitle} numberOfLines={3} ellipsizeMode="tail">
            {title}
          </Text>
          {author ? (
            <Text style={styles.fallbackAuthor} numberOfLines={1}>
              {author}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
      <View style={[styles.innerBorder, { borderRadius }]} pointerEvents="none" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#15171E',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  innerBorder: {
    ...StyleSheet.absoluteFill,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  fallbackGradient: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
    position: 'relative',
  },
  spineDeco: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  topIconBox: {
    alignSelf: 'flex-start',
    marginLeft: 4,
  },
  fallbackContent: {
    marginLeft: 4,
  },
  fallbackTitle: {
    color: '#F4F4F6',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  fallbackAuthor: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
  },
});
