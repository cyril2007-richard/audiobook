import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type IconName =
  | 'play'
  | 'pause'
  | 'skip-forward-15'
  | 'skip-forward-30'
  | 'skip-backward-15'
  | 'skip-backward-30'
  | 'next'
  | 'prev'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'settings'
  | 'refresh'
  | 'search'
  | 'close'
  | 'check'
  | 'book'
  | 'bookmark'
  | 'timer'
  | 'trash'
  | 'edit'
  | 'alert'
  | 'home'
  | 'library'
  | 'profile'
  | 'folder'
  | 'speedometer'
  | 'shield'
  | 'information'
  | 'stats'
  | 'time'
  | 'flame'
  | 'headset'
  | 'sparkles';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  color = '#FFFFFF',
  style,
}) => {
  let ioniconName: keyof typeof Ionicons.glyphMap;

  switch (name) {
    case 'play':
      ioniconName = 'play';
      break;
    case 'pause':
      ioniconName = 'pause';
      break;
    case 'next':
      ioniconName = 'play-skip-forward';
      break;
    case 'prev':
      ioniconName = 'play-skip-back';
      break;
    case 'chevron-left':
      ioniconName = 'chevron-back';
      break;
    case 'chevron-right':
      ioniconName = 'chevron-forward';
      break;
    case 'chevron-down':
      ioniconName = 'chevron-down';
      break;
    case 'settings':
      ioniconName = 'settings-outline';
      break;
    case 'refresh':
      ioniconName = 'refresh';
      break;
    case 'search':
      ioniconName = 'search';
      break;
    case 'close':
      ioniconName = 'close';
      break;
    case 'check':
      ioniconName = 'checkmark';
      break;
    case 'book':
      ioniconName = 'book-outline';
      break;
    case 'bookmark':
      ioniconName = 'bookmark-outline';
      break;
    case 'timer':
      ioniconName = 'timer-outline';
      break;
    case 'trash':
      ioniconName = 'trash-outline';
      break;
    case 'edit':
      ioniconName = 'pencil';
      break;
    case 'alert':
      ioniconName = 'alert-circle-outline';
      break;
    case 'home':
      ioniconName = 'home';
      break;
    case 'library':
      ioniconName = 'library';
      break;
    case 'profile':
      ioniconName = 'person';
      break;
    case 'folder':
      ioniconName = 'folder-outline';
      break;
    case 'speedometer':
      ioniconName = 'speedometer-outline';
      break;
    case 'shield':
      ioniconName = 'shield-checkmark-outline';
      break;
    case 'information':
      ioniconName = 'information-circle-outline';
      break;
    case 'stats':
      ioniconName = 'stats-chart-outline';
      break;
    case 'time':
      ioniconName = 'time-outline';
      break;
    case 'flame':
      ioniconName = 'flame-outline';
      break;
    case 'headset':
      ioniconName = 'headset-outline';
      break;
    case 'sparkles':
      ioniconName = 'sparkles-outline';
      break;
    case 'skip-forward-15':
    case 'skip-forward-30':
      ioniconName = 'play-forward';
      break;
    case 'skip-backward-15':
    case 'skip-backward-30':
      ioniconName = 'play-back';
      break;
    default:
      ioniconName = 'help-circle-outline';
      break;
  }

  return <Ionicons name={ioniconName} size={size} color={color} style={style} />;
};
