import { ParsedMetadata } from './id3';

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(bytes[offset + i]);
  }
  return str;
}

/**
 * Fast pure-JS parser for ISO BMFF (M4A / M4B / MP4) metadata boxes
 */
export function parseMP4(bytes: Uint8Array): ParsedMetadata | null {
  if (bytes.length < 8) return null;

  const metadata: ParsedMetadata = {};

  function scanAtoms(start: number, end: number) {
    let p = start;
    while (p + 8 <= end) {
      const size = readUint32BE(bytes, p);
      if (size < 8) break;
      const type = readString(bytes, p + 4, 4);
      const atomEnd = Math.min(p + size, end);

      if (type === 'moov' || type === 'udta') {
        scanAtoms(p + 8, atomEnd);
      } else if (type === 'mvhd') {
        // mvhd contains timescale and duration
        try {
          const version = bytes[p + 8];
          if (version === 0 && p + 8 + 24 <= atomEnd) {
            const timescale = readUint32BE(bytes, p + 8 + 12);
            const duration = readUint32BE(bytes, p + 8 + 16);
            if (timescale > 0) {
              metadata.duration = duration / timescale;
            }
          }
        } catch {
          // Ignore
        }
      } else if (type === 'meta') {
        // meta has 4 bytes version/flags, then children
        scanAtoms(p + 12, atomEnd);
      } else if (type === 'ilst') {
        scanIlst(p + 8, atomEnd);
      }

      p = atomEnd;
    }
  }

  function scanIlst(start: number, end: number) {
    let p = start;
    while (p + 8 <= end) {
      const size = readUint32BE(bytes, p);
      if (size < 8) break;
      const type = readString(bytes, p + 4, 4);
      const atomEnd = Math.min(p + size, end);

      // Value data is inside child 'data' atom (offset p + 8)
      if (p + 16 <= atomEnd) {
        const dataSize = readUint32BE(bytes, p + 8);
        const dataType = readString(bytes, p + 12, 4);
        if (dataType === 'data' && dataSize >= 16) {
          const flag = bytes[p + 19];
          const payloadStart = p + 24;
          const payloadLength = dataSize - 16;

          if (payloadStart + payloadLength <= atomEnd) {
            if (type === '©nam') {
              metadata.title = new TextDecoder('utf-8').decode(bytes.subarray(payloadStart, payloadStart + payloadLength)).trim();
            } else if (type === '©ART' || type === 'aART') {
              if (!metadata.artist) {
                metadata.artist = new TextDecoder('utf-8').decode(bytes.subarray(payloadStart, payloadStart + payloadLength)).trim();
              }
            } else if (type === '©alb') {
              metadata.album = new TextDecoder('utf-8').decode(bytes.subarray(payloadStart, payloadStart + payloadLength)).trim();
            } else if (type === 'trkn' && payloadLength >= 4) {
              metadata.track = (bytes[payloadStart + 2] << 8) | bytes[payloadStart + 3];
            } else if (type === 'covr' && !metadata.coverData) {
              metadata.coverData = {
                mime: flag === 14 ? 'image/png' : 'image/jpeg',
                bytes: bytes.slice(payloadStart, payloadStart + payloadLength),
              };
            }
          }
        }
      }

      p = atomEnd;
    }
  }

  try {
    scanAtoms(0, bytes.length);
    return metadata;
  } catch {
    return null;
  }
}
