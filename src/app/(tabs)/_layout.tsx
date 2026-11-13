import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Icon } from '../../components/icon';
import { MiniPlayer } from '../../components/mini-player';

// White for active tab per dark minimal aesthetic
const ACCENT = '#FFFFFF';
const INACTIVE = '#71717A';
const BORDER = 'rgba(255,255,255,0.08)';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + insets.bottom;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar,
            {
              height: tabBarHeight,
              paddingBottom: bottomInset,
            },
          ],
          tabBarBackground: () => (
            <BlurView
              intensity={80}
              tint="systemChromeMaterialDark"
              style={[StyleSheet.absoluteFill, styles.blurBackground]}
            />
          ),
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: INACTIVE,
          tabBarLabelStyle: styles.tabBarLabel,
          sceneStyle: { backgroundColor: '#000000' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <Icon name="home" size={20} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color }) => <Icon name="library" size={20} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <Icon name="profile" size={20} color={color as string} />,
          }}
        />
      </Tabs>

      {/* Floating Mini Player positioned directly above the tabs */}
      <View
        style={[styles.miniPlayerWrapper, { bottom: tabBarHeight }]}
        pointerEvents="box-none"
      >
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    borderTopColor: BORDER,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    elevation: 0,
  },
  blurBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  miniPlayerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
