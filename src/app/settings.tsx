import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import {
  getSetting,
  setSetting,
  getAllBooks,
} from '../db';
import {
  getSavedLibraryDirectory,
  requestLibraryDirectory,
  getNameFromUri,
} from '../services/saf';
import { scanLibrary, isScanInProgress, subscribeScanProgress } from '../services/scanner';
import { useSidecarCache } from '../hooks/use-sidecar-cache';
import { Icon } from '../components/icon';
import { R, SCROLL_BOTTOM_INSET } from '../constants/theme';
import { BookWithDetails } from '../types';

export default function SettingsScreen() {
  const [folderUri, setFolderUri] = useState<string | null>(() => getSavedLibraryDirectory());
  const [defaultSpeed, setDefaultSpeed] = useState<string>(
    () => getSetting('default_playback_speed', '1.0') || '1.0'
  );
  const [skipForward, setSkipForward] = useState<string>(
    () => getSetting('skip_forward_duration', '30') || '30'
  );
  const [skipBackward, setSkipBackward] = useState<string>(
    () => getSetting('skip_backward_duration', '15') || '15'
  );
  const [readerName, setReaderName] = useState<string>(
    () => getSetting('reader_name', 'Reader') || 'Reader'
  );

  const [isScanning, setIsScanning] = useState<boolean>(() => isScanInProgress());
  const [books, setBooks] = useState<BookWithDetails[]>(() => getAllBooks());
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [tempName, setTempName] = useState(readerName);

  const { getSidecar, refreshAll } = useSidecarCache(books);

  useEffect(() => {
    const unsub = subscribeScanProgress((event) => {
      setIsScanning(event.status === 'scanning');
      if (event.status === 'completed') {
        const fresh = getAllBooks();
        setBooks(fresh);
        refreshAll();
      }
    });
    return unsub;
  }, [refreshAll]);

  // Statistics
  const totalBooks = books.length;
  const completedBooks = useMemo(() => {
    return books.filter((b) => {
      const sc = getSidecar(b.path);
      return sc.progress?.finished === 1;
    }).length;
  }, [books, getSidecar]);

  const totalListeningHours = useMemo(() => {
    const totalSec = books.reduce((acc, b) => acc + (b.duration || 0), 0);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  }, [books]);

  const handleChangeFolder = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newUri = await requestLibraryDirectory();
    if (newUri) {
      setFolderUri(newUri);
      await scanLibrary(newUri);
      setBooks(getAllBooks());
      await refreshAll();
    }
  };

  const handleRescan = async () => {
    if (!folderUri) {
      Alert.alert('No Folder Selected', 'Please choose an audiobook directory first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsScanning(true);
    await scanLibrary(folderUri);
    setBooks(getAllBooks());
    await refreshAll();
    setIsScanning(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Scan Complete', `Found ${getAllBooks().length} audiobooks in library.`);
  };

  const handleClearCoverCache = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Clear Artwork Cache',
      'This will delete all cached cover art images. They will be regenerated the next time you browse your books.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            try {
              const coversDir = `${FileSystem.documentDirectory}covers/`;
              const info = await FileSystem.getInfoAsync(coversDir);
              if (info.exists) {
                await FileSystem.deleteAsync(coversDir, { idempotent: true });
                await FileSystem.makeDirectoryAsync(coversDir, { intermediates: true });
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Cache Cleared', 'Cover art cache successfully emptied.');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not clear cache.');
            }
          },
        },
      ]
    );
  };

  const handleSetSpeed = (s: string) => {
    Haptics.selectionAsync();
    setDefaultSpeed(s);
    setSetting('default_playback_speed', s);
  };

  const handleSetSkipForward = (s: string) => {
    Haptics.selectionAsync();
    setSkipForward(s);
    setSetting('skip_forward_duration', s);
  };

  const handleSetSkipBackward = (s: string) => {
    Haptics.selectionAsync();
    setSkipBackward(s);
    setSetting('skip_backward_duration', s);
  };

  const handleSaveName = () => {
    const trimmed = tempName.trim() || 'Reader';
    setReaderName(trimmed);
    setSetting('reader_name', trimmed);
    setEditNameModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const folderDisplayName = folderUri ? getNameFromUri(folderUri) : 'Not configured';

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Large Minimal Title */}
        <View style={styles.largeTitleContainer}>
          <Text style={styles.largeTitle}>Profile</Text>
        </View>

        {/* Minimal Monochrome Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeroRow}>
            {/* Minimal Matte Avatar */}
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {(readerName.trim()[0] || 'L').toUpperCase()}
              </Text>
            </View>

            <View style={styles.profileHeroInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {readerName}
              </Text>
              <Text style={styles.profileTagline}>Local Audiobooks • Offline</Text>
            </View>

            {/* Edit Icon Button */}
            <TouchableOpacity
              style={styles.editIconButton}
              onPress={() => {
                setTempName(readerName);
                setEditNameModalVisible(true);
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Icon name="edit" size={14} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          {/* Hairline Divider */}
          <View style={styles.cardDivider} />

          {/* Minimal 3-Column Metrics */}
          <View style={styles.statsRow}>
            <View style={styles.statColumn}>
              <Text style={styles.statNumber}>{totalBooks}</Text>
              <Text style={styles.statLabel}>Books</Text>
            </View>

            <View style={styles.statVerticalDivider} />

            <View style={styles.statColumn}>
              <Text style={styles.statNumber}>{completedBooks}</Text>
              <Text style={styles.statLabel}>Finished</Text>
            </View>

            <View style={styles.statVerticalDivider} />

            <View style={styles.statColumn}>
              <Text style={styles.statNumber} numberOfLines={1}>
                {totalListeningHours}
              </Text>
              <Text style={styles.statLabel}>Total Time</Text>
            </View>
          </View>
        </View>

        {/* ─── SECTION 1: PLAYBACK PREFERENCES ─── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>PLAYBACK</Text>
          <View style={styles.groupedCard}>
            {/* Default Speed */}
            <View style={styles.groupedRowColumn}>
              <View style={styles.rowHeader}>
                <View style={styles.iconSquircle}>
                  <Icon name="speedometer" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.rowLabelContainer}>
                  <Text style={styles.rowLabel}>Speed</Text>
                  <Text style={styles.rowCurrentValue}>{defaultSpeed}x</Text>
                </View>
              </View>

              {/* Monochrome Segmented Control */}
              <View style={styles.segmentedControl}>
                {['1.0', '1.25', '1.5', '1.75', '2.0'].map((speed) => {
                  const active = defaultSpeed === speed;
                  return (
                    <TouchableOpacity
                      key={speed}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      onPress={() => handleSetSpeed(speed)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                        {speed}x
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.rowDivider} />

            {/* Skip Forward Duration */}
            <View style={styles.groupedRowColumn}>
              <View style={styles.rowHeader}>
                <View style={styles.iconSquircle}>
                  <Icon name="skip-forward-30" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.rowLabelContainer}>
                  <Text style={styles.rowLabel}>Forward</Text>
                  <Text style={styles.rowCurrentValue}>{skipForward}s</Text>
                </View>
              </View>

              <View style={styles.segmentedControl}>
                {['15', '30', '45', '60'].map((secs) => {
                  const active = skipForward === secs;
                  return (
                    <TouchableOpacity
                      key={secs}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      onPress={() => handleSetSkipForward(secs)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                        {secs}s
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.rowDivider} />

            {/* Skip Backward Duration */}
            <View style={styles.groupedRowColumn}>
              <View style={styles.rowHeader}>
                <View style={styles.iconSquircle}>
                  <Icon name="skip-backward-15" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.rowLabelContainer}>
                  <Text style={styles.rowLabel}>Backward</Text>
                  <Text style={styles.rowCurrentValue}>{skipBackward}s</Text>
                </View>
              </View>

              <View style={styles.segmentedControl}>
                {['10', '15', '30'].map((secs) => {
                  const active = skipBackward === secs;
                  return (
                    <TouchableOpacity
                      key={secs}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      onPress={() => handleSetSkipBackward(secs)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                        {secs}s
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.rowDivider} />

            {/* Contextual Rewind */}
            <View style={styles.actionRow}>
              <View style={styles.iconSquircle}>
                <Icon name="time" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.actionRowText}>
                <Text style={styles.rowLabel}>Smart Rewind</Text>
                <Text style={styles.rowSubtext}>Rewinds 3s on resume</Text>
              </View>
              <Text style={styles.badgeTextMuted}>3s</Text>
            </View>
          </View>
        </View>

        {/* ─── SECTION 2: STORAGE & LIBRARY ─── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>STORAGE</Text>
          <View style={styles.groupedCard}>
            {/* Library Directory */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleChangeFolder}
              activeOpacity={0.7}
            >
              <View style={styles.iconSquircle}>
                <Icon name="folder" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.actionRowText}>
                <Text style={styles.rowLabel}>Library Folder</Text>
                <Text style={styles.rowSubtext} numberOfLines={1}>
                  {folderDisplayName}
                </Text>
              </View>
              <View style={styles.inlineActionBtn}>
                <Text style={styles.inlineActionBtnText}>
                  {folderUri ? 'Change' : 'Choose'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Rescan Library */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleRescan}
              disabled={isScanning}
              activeOpacity={0.7}
            >
              <View style={styles.iconSquircle}>
                <Icon name="refresh" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.actionRowText}>
                <Text style={styles.rowLabel}>Rescan Library</Text>
                <Text style={styles.rowSubtext}>
                  {isScanning ? 'Scanning...' : 'Check for new audio files'}
                </Text>
              </View>
              {isScanning ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="chevron-right" size={14} color="#71717A" />
              )}
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Storage Architecture */}
            <View style={styles.actionRow}>
              <View style={styles.iconSquircle}>
                <Icon name="shield" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.actionRowText}>
                <Text style={styles.rowLabel}>Data Storage</Text>
                <Text style={styles.rowSubtext}>lumen.json per book folder</Text>
              </View>
              <Text style={styles.badgeTextMuted}>Local</Text>
            </View>
          </View>
        </View>

        {/* ─── SECTION 3: MAINTENANCE ─── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>CACHE</Text>
          <View style={styles.groupedCard}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleClearCoverCache}
              activeOpacity={0.7}
            >
              <View style={styles.iconSquircle}>
                <Icon name="trash" size={16} color="#A1A1AA" />
              </View>
              <View style={styles.actionRowText}>
                <Text style={styles.rowLabel}>Clear Artwork Cache</Text>
                <Text style={styles.rowSubtext}>Deletes cached cover thumbnails</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#71717A" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── SECTION 4: ABOUT ─── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>SYSTEM</Text>
          <View style={styles.groupedCard}>
            <View style={styles.infoRowStatic}>
              <Text style={styles.infoStaticLabel}>Version</Text>
              <Text style={styles.infoStaticValue}>1.0.0</Text>
            </View>

            <View style={styles.rowDividerSimple} />

            <View style={styles.infoRowStatic}>
              <Text style={styles.infoStaticLabel}>Engine</Text>
              <Text style={styles.infoStaticValue}>Expo Audio 58</Text>
            </View>

            <View style={styles.rowDividerSimple} />

            <View style={styles.infoRowStatic}>
              <Text style={styles.infoStaticLabel}>Privacy</Text>
              <Text style={styles.infoStaticValue}>Zero Telemetry</Text>
            </View>
          </View>
        </View>

        {/* Minimal Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Lumen</Text>
          <Text style={styles.footerSubtitle}>Minimalist Offline Audiobook Player</Text>
        </View>
      </ScrollView>

      {/* Edit Name Modal */}
      <Modal
        visible={editNameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reader Name</Text>
            <Text style={styles.modalSubtitle}>
              Personalize your offline profile.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={tempName}
              onChangeText={setTempName}
              placeholder="Your name"
              placeholderTextColor="#71717A"
              autoFocus
              maxLength={24}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditNameModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveName}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: SCROLL_BOTTOM_INSET,
  },
  largeTitleContainer: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  largeTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },

  /* ─── Profile Card ─── */
  profileCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  profileHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  profileHeroInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  profileTagline: {
    color: '#71717A',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  editIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },

  /* ─── 3-Column Metrics ─── */
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statColumn: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statLabel: {
    color: '#71717A',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  statVerticalDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  /* ─── Grouped Sections ─── */
  sectionContainer: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71717A',
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingHorizontal: 8,
    textTransform: 'uppercase',
  },
  groupedCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  groupedRowColumn: {
    padding: 14,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  rowCurrentValue: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '600',
  },
  rowSubtext: {
    color: '#71717A',
    fontSize: 11,
    marginTop: 2,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 54,
  },
  rowDividerSimple: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 14,
  },

  /* ─── Segmented Controls ─── */
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#050507',
    borderRadius: 8,
    padding: 2,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentBtnText: {
    color: '#71717A',
    fontSize: 12,
    fontWeight: '500',
  },
  segmentBtnTextActive: {
    color: '#000000',
    fontWeight: '700',
  },

  /* ─── Inset Action & Info Rows ─── */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  actionRowText: {
    flex: 1,
    marginRight: 10,
  },
  inlineActionBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: R.pill,
  },
  inlineActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  badgeTextMuted: {
    color: '#71717A',
    fontSize: 12,
    fontWeight: '400',
  },
  infoRowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  infoStaticLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
  },
  infoStaticValue: {
    color: '#71717A',
    fontSize: 13,
    fontWeight: '400',
  },

  /* ─── Footer ─── */
  footer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
    paddingVertical: 8,
  },
  footerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  footerSubtitle: {
    color: '#52525B',
    fontSize: 11,
    fontWeight: '400',
  },

  /* ─── Modal ─── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#121215',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#71717A',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#09090B',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  modalCancelText: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '500',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalSaveText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
});
