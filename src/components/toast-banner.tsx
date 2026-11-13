import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { usePlayer } from '../hooks/use-player';
import { Icon } from './icon';

export const ToastBanner: React.FC = () => {
  const { errorMessage, dismissError } = usePlayer();

  if (!errorMessage) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.pill}>
        <Icon name="alert" size={16} color="#F87171" style={styles.icon} />
        <Text style={styles.message} numberOfLines={2}>
          {errorMessage}
        </Text>
        <TouchableOpacity style={styles.dismissBtn} onPress={dismissError}>
          <Icon name="close" size={12} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1618',
    borderWidth: 1,
    borderColor: '#542023',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    maxWidth: '100%',
  },
  icon: {
    marginRight: 8,
  },
  message: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '500',
  },
  dismissBtn: {
    padding: 4,
    marginLeft: 6,
  },
});
