export interface ParsedMetadata {
  title?: string;
  artist?: string;
  album?: string;
  track?: number;
  duration?: number; // seconds
  coverData?: {
    mime: string;
    bytes: Uint8Array;
  };
}

/**
 * Decode a synchsafe integer (7 bits per byte)
 */
function readSynchsafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

/**
 * Decode standard 32-bit big endian integer
 */
function readInt32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  );
}

/**
 * Decode text based on ID3 encoding byte:
 * 0: ISO-8859-1, 1: UTF-16 with BOM, 2: UTF-16BE, 3: UTF-8
 */
function decodeText(bytes: Uint8Array, offset: number, length: number): string {
  if (length <= 0 || offset + length > bytes.length) return '';
  const encoding = bytes[offset];
  const data = bytes.subarray(offset + 1, offset + length);

  try {
    if (encoding === 0 || encoding === 3) {
      // Latin1 or UTF-8
      return new TextDecoder(encoding === 0 ? 'iso-8859-1' : 'utf-8').decode(data).replace(/\0/g, '').trim();
    } else if (encoding === 1 || encoding === 2) {
      // UTF-16
      return new TextDecoder('utf-16').decode(data).replace(/\0/g, '').trim();
    }
    return new TextDecoder('utf-8').decode(data).replace(/\0/g, '').trim();
  } catch {
    let str = '';
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0) str += String.fromCharCode(data[i]);
    }
    return str.trim();
  }
}

/**
 * Parse ID3v2 header and tags from a buffer
 */
export function parseID3(bytes: Uint8Array): ParsedMetadata | null {
  // Check 'ID3' magic marker
  if (bytes.length < 10) return null;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;

  const version = bytes[3]; // 3 for ID3v2.3, 4 for ID3v2.4
  const tagSize = readSynchsafeInt(bytes, 6);
  const totalHeaderSize = 10;
  const maxOffset = Math.min(bytes.length, totalHeaderSize + tagSize);

  let offset = totalHeaderSize;
  const metadata: ParsedMetadata = {};

  while (offset + 10 <= maxOffset) {
    let frameId = '';
    for (let i = 0; i < 4; i++) {
      const c = bytes[offset + i];
      if (c >= 32 && c <= 126) frameId += String.fromCharCode(c);
    }

    if (frameId.length < 4) break;

    // Frame size
    const frameSize = version === 4
      ? readSynchsafeInt(bytes, offset + 4)
      : readInt32(bytes, offset + 4);

    if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break;

    const frameDataOffset = offset + 10;

    switch (frameId) {
      case 'TIT2': // Title
        metadata.title = decodeText(bytes, frameDataOffset, frameSize);
        break;
      case 'TPE1': // Artist / Author
        metadata.artist = decodeText(bytes, frameDataOffset, frameSize);
        break;
      case 'TALB': // Album / Series
        metadata.album = decodeText(bytes, frameDataOffset, frameSize);
        break;
      case 'TRCK': { // Track number
        const trackStr = decodeText(bytes, frameDataOffset, frameSize);
        const match = trackStr.match(/^(\d+)/);
        if (match) metadata.track = parseInt(match[1], 10);
        break;
      }
      case 'APIC': { // Attached picture (cover)
        if (!metadata.coverData && frameSize > 10) {
          try {
            let p = frameDataOffset + 1; // skip encoding byte
            let mime = '';
            while (p < frameDataOffset + frameSize && bytes[p] !== 0) {
              mime += String.fromCharCode(bytes[p]);
              p++;
            }
            p++; // skip null delimiter
            p++; // skip picture type byte
            while (p < frameDataOffset + frameSize && bytes[p] !== 0) {
              p++; // skip description text
            }
            p++; // skip description delimiter

            if (p < frameDataOffset + frameSize) {
              const imgBytes = bytes.slice(p, frameDataOffset + frameSize);
              metadata.coverData = {
                mime: mime || 'image/jpeg',
                bytes: imgBytes,
              };
            }
          } catch {
            // Ignore APIC parse failure
          }
        }
        break;
      }
    }

    offset += 10 + frameSize;
  }

  return metadata;
}
