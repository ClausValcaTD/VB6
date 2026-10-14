/** Deterministic multi-resolution ICO/CUR fixture, independent of native codecs. */
import {fromBase64} from '../../../src/project/frx.js';
// Opaque white RGBA PNG, 256x256, independently encoded with zlib.
const png256=[
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAACWUlEQVR42u3UMQEAAAzCMPyb',
  'BgNzsERCj6bAW5EADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAA',
  'AAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMAAwAMADAAwAAAAwAMADAA',
  'wAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAA',
  'wAAAAwAMADAAwAAAAwADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwA',
  'MADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAMADAAwAMAAAAMA',
  'DAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMA',
  'DAAwAMAAAAMADAAwAMAAAAMAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAA',
  'AwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwADAAwAMADA',
  'AAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADA',
  'AAADAAwAMADAAAADAAwAMADAAAADAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAw',
  'AMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMALgPmUDvF0QYlBwAA',
  'AABJRU5ErkJggg==',
].join('');
export function multiPictureBytes(cursor = false) {
  const sizes = [16, 32, 64, 256], entries = [];
  for (const [i, size] of sizes.entries()) {
    const stride = Math.ceil(size / 32) * 4;
    const bytes = new Uint8Array(40 + size * size * 4 + stride * size), view = new DataView(bytes.buffer);
    view.setUint32(0, 40, true); view.setUint32(4, size, true); view.setUint32(8, size * 2, true);
    view.setUint16(12, 1, true); view.setUint16(14, 32, true);
    const rgb = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]][i];
    for (let j = 0; j < size * size; j++) bytes.set([rgb[2], rgb[1], rgb[0], 255], 40 + j * 4);
    entries.push({size, bytes: size === 256 ? fromBase64(png256) : bytes, x: i + 1, y: i + 3});
  }
  const dataStart = 6 + 16 * entries.length;
  const out = new Uint8Array(dataStart + entries.reduce((sum, entry) => sum + entry.bytes.length, 0));
  const view = new DataView(out.buffer); view.setUint16(2, cursor ? 2 : 1, true); view.setUint16(4, entries.length, true);
  let offset = dataStart;
  for (const [i, entry] of entries.entries()) {
    const at = 6 + i * 16;
    out[at] = out[at + 1] = entry.size & 255;
    view.setUint16(at + 4, cursor ? entry.x : 1, true); view.setUint16(at + 6, cursor ? entry.y : 32, true);
    view.setUint32(at + 8, entry.bytes.length, true); view.setUint32(at + 12, offset, true);
    out.set(entry.bytes, offset); offset += entry.bytes.length;
  }
  return out;
}
