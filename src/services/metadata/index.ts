import * as FileSystem from 'expo-file-system/legacy';
import { parseID3, ParsedMetadata } from './id3';
import { parseMP4 } from './mp4';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Read the first N bytes of a file using SAF URI and base64 encoding.
 */
export async function readFileHeaderBytes(uri: string, length: number = 256 * 1024): Promise<Uint8Array | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length,
    });
    return base64ToUint8Array(base64);
  } catch {
    // Some devices might fail with position/length on SAF, fallback to reading whole if small or plain read
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64ToUint8Array(base64.substring(0, Math.min(base64.length, Math.ceil(length * 1.35))));
    } catch {
      return null;
    }
  }
}

/**
 * Parse metadata from an audio file given its SAF URI and filename.
 */
export async function parseAudioMetadata(uri: string, filename: string): Promise<ParsedMetadata> {
  const lower = filename.toLowerCase();

  try {
    const bytes = await readFileHeaderBytes(uri, 512 * 1024);
    if (!bytes || bytes.length === 0) {
      return {};
    }

    if (lower.endsWith('.mp3')) {
      const id3 = parseID3(bytes);
      if (id3) return id3;
    } else if (lower.endsWith('.m4b') || lower.endsWith('.m4a') || lower.endsWith('.aac') || lower.endsWith('.mp4')) {
      const mp4 = parseMP4(bytes);
      if (mp4) return mp4;
    } else {
      // Try ID3 first, then MP4
      const id3 = parseID3(bytes);
      if (id3 && (id3.title || id3.artist || id3.coverData)) return id3;
      const mp4 = parseMP4(bytes);
      if (mp4 && (mp4.title || mp4.artist || mp4.coverData)) return mp4;
    }
  } catch (error) {
    console.warn('Metadata parsing failed for:', filename, error);
  }

  return {};
}

/**
 * Save raw cover bytes or copy a cover image file to local cache.
 */
export async function saveCoverImage(
  bookId: string,
  source: { uri?: string; bytes?: Uint8Array; mime?: string }
): Promise<string | null> {
  try {
    const coversDir = `${FileSystem.documentDirectory}covers/`;
    const dirInfo = await FileSystem.getInfoAsync(coversDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(coversDir, { intermediates: true });
    }

    const ext = source.mime?.includes('png') ? 'png' : 'jpg';
    const destination = `${coversDir}${bookId}_${Date.now()}.${ext}`;

    if (source.bytes) {
      const base64 = uint8ArrayToBase64(source.bytes);
      await FileSystem.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return destination;
    } else if (source.uri) {
      // Copy from SAF or local URI
      await FileSystem.copyAsync({
        from: source.uri,
        to: destination,
      });
      return destination;
    }
    return null;
  } catch (error) {
    console.error('Failed to cache cover image:', error);
    return null;
  }
}
