import * as FileSystem from 'expo-file-system/legacy';
import jpeg from 'jpeg-js';

const FALLBACK_AMBER = '#F59E0B'; // Warm amber

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract vibrant accent color from a JPEG image file.
 * Returns a hex color string (e.g. '#e07a5f') or warm amber fallback.
 */
export async function extractAccentColor(imagePath: string | null): Promise<string> {
  if (!imagePath) return FALLBACK_AMBER;

  try {
    // Read the image file as base64
    const base64 = await FileSystem.readAsStringAsync(imagePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const bytes = base64ToUint8Array(base64);
    // jpeg-js decode
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    if (!decoded || !decoded.data) return FALLBACK_AMBER;

    const data = decoded.data;
    const pixelCount = decoded.width * decoded.height;
    // Sample up to 1000 pixels across the image
    const step = Math.max(1, Math.floor(pixelCount / 1000)) * 4;

    let bestColor = FALLBACK_AMBER;
    let maxScore = -1;

    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Exclude overly dark or overly bright pixels
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 40 || brightness > 220) continue;

      // Calculate saturation score: max - min difference
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max - min;

      // We favor colorful/saturated tones that stand out nicely against dark backgrounds
      const score = saturation * 1.5 + (brightness > 100 && brightness < 180 ? 50 : 0);

      if (score > maxScore) {
        maxScore = score;
        bestColor = rgbToHex(r, g, b);
      }
    }

    return bestColor;
  } catch {
    return FALLBACK_AMBER;
  }
}
