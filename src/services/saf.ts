import { StorageAccessFramework } from 'expo-file-system/legacy';
import { getSetting, setSetting } from '../db';

const SETTING_LIBRARY_URI = 'library_folder_uri';

export const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4b',
  '.m4a',
  '.aac',
  '.flac',
  '.opus',
  '.ogg',
  '.wav',
];

export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Request directory permissions from user via SAF and persist URI in DB.
 */
export async function requestLibraryDirectory(): Promise<string | null> {
  try {
    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permissions.granted && permissions.directoryUri) {
      setSetting(SETTING_LIBRARY_URI, permissions.directoryUri);
      return permissions.directoryUri;
    }
    return null;
  } catch (error) {
    console.error('Failed to request directory permissions:', error);
    return null;
  }
}

/**
 * Retrieve persisted library directory URI from SQLite settings.
 */
export function getSavedLibraryDirectory(): string | null {
  return getSetting(SETTING_LIBRARY_URI);
}

/**
 * List contents of a SAF directory URI.
 */
export async function listDirectoryContents(dirUri: string): Promise<string[]> {
  try {
    return await StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch (error) {
    console.error('Failed to read directory:', dirUri, error);
    return [];
  }
}

/**
 * Extract human-readable file or folder name from a SAF URI.
 */
export function getNameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const lastSlash = decoded.lastIndexOf('/');
    let name = lastSlash !== -1 ? decoded.substring(lastSlash + 1) : decoded;

    // Remove primary: or similar storage volume prefixes
    const colonIdx = name.lastIndexOf(':');
    if (colonIdx !== -1) {
      name = name.substring(colonIdx + 1);
    }
    return name;
  } catch {
    return uri;
  }
}

/**
 * Check if a URI corresponds to a supported audio file based on extension.
 */
export function isAudioFile(uri: string): boolean {
  const name = getNameFromUri(uri).toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Check if a URI corresponds to a supported image file based on extension.
 */
export function isImageFile(uri: string): boolean {
  const name = getNameFromUri(uri).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Natural sort strings so '02' or '2' precedes '10'.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Extract series order number prefix from folder or title if present (e.g. "1 - Red Rising", "02 Golden Son").
 * Returns { order: number | null, cleanTitle: string }
 */
export function parseSeriesOrderAndTitle(name: string): { order: number | null; cleanTitle: string } {
  // Regex matching patterns like "1 - Title", "01. Title", "1 Title", "Book 2 - Title", "Book 2 Title"
  const match = name.match(/^(?:Book\s+)?(\d+(?:\.\d+)?)\s*[-_.:)]\s*(.*)$/i) ||
                name.match(/^(\d+(?:\.\d+)?)\s+(.*)$/);

  if (match) {
    const order = parseFloat(match[1]);
    const cleanTitle = match[2]?.trim() || name;
    return { order: isNaN(order) ? null : order, cleanTitle };
  }

  return { order: null, cleanTitle: name.trim() };
}
