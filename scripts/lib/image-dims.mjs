/**
 * Image dimension parser — baca width/height langsung dari byte gambar
 * (tanpa decode penuh). Dipakai untuk membuang iklan/banner kecil
 * (mis. 400×25) yang lolos ke chapter_images + R2.
 *
 * Format didukung: PNG, GIF, JPEG (SOF), WebP (VP8/VP8L/VP8X), AVIF (ispe).
 * Return null bila format tidak dikenali — pemanggil sebaiknya MEMBIARKAN
 * gambar yang tidak dikenali (unknown ≠ kecil).
 */

export function getImageDimensions(buf) {
  if (!buf || buf.length < 12) return null;

  // ── PNG: sig 8 byte, lalu IHDR: width @16, height @20 (big-endian) ──────
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    if (buf.length < 24) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // ── GIF: sig 'GIF', width @6, height @8 (little-endian) ──────────────────
  if (buf.toString('ascii', 0, 3) === 'GIF') {
    if (buf.length < 10) return null;
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // ── JPEG: cari marker SOF0–SOF15 ─────────────────────────────────────────
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      // SOF0..SOF15 kecuali DHT(C4), JPG(C8), DAC(CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      const len = buf.readUInt16BE(off + 2);
      if (len < 2) return null;
      off += 2 + len;
    }
    return null;
  }

  // ── WebP: RIFF....WEBP + chunk VP8 / VP8L / VP8X ────────────────────────
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ' && buf.length >= 30) {
      // lossy: frame tag @20(3B) + start code @23(3B) + width @26 + height @28 (14-bit LE)
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L' && buf.length >= 25) {
      // lossless: sig 0x2F @20 lalu 14-bit width-1 / 14-bit height-1
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X' && buf.length >= 30) {
      // extended: canvas width-1 @24 (3B LE), height-1 @27 (3B LE)
      return {
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
      };
    }
    return null;
  }

  // ── AVIF/HEIF (ISO BMFF): cari box 'ispe' pertama ────────────────────────
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const idx = buf.indexOf(Buffer.from('ispe'), 12);
    if (idx !== -1 && idx + 16 <= buf.length) {
      return { width: buf.readUInt32BE(idx + 8), height: buf.readUInt32BE(idx + 12) };
    }
    return null;
  }

  return null;
}

/**
 * True bila gambar terlalu kecil untuk jadi halaman manga (indikasi iklan/
 * banner). Format tidak dikenali dianggap BUKAN kecil (aman dipertahankan).
 */
export function isTooSmallImage(buf, minSide) {
  const dims = getImageDimensions(buf);
  if (!dims) return false;
  return Math.min(dims.width, dims.height) < minSide;
}
