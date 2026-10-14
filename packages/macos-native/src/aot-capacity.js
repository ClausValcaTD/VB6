/** Project-sized Mach-O segments, bounded by the existing 64 MiB image policy.
 * This is an allocation policy, not an increase of the parser/archive limits. */
export const AOT_PAGE_BYTES = 16384;
export const AOT_IMAGE_LIMIT = 64 * 1024 * 1024;
export const AOT_METADATA_LIMIT = 8 * 1024 * 1024;
export function aotSegmentSize(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > AOT_IMAGE_LIMIT)
    throw new RangeError('Invalid native project segment size');
  return Math.max(AOT_PAGE_BYTES, Math.ceil(bytes / AOT_PAGE_BYTES) * AOT_PAGE_BYTES);
}
/** Compute independent code/metadata capacities without allocating an image. */
export function planAOTCapacity(codeBytes, metadataBytes, fixedBytes) {
  if (!Number.isSafeInteger(codeBytes) || codeBytes < 4 || codeBytes % 4)
    throw new RangeError('Native code must contain aligned ARM64 instructions');
  if (!Number.isSafeInteger(metadataBytes) || metadataBytes < 1 || metadataBytes > AOT_METADATA_LIMIT)
    throw new RangeError('Native metadata exceeds the bounded 8 MiB reader');
  if (!Number.isSafeInteger(fixedBytes) || fixedBytes < 0 || fixedBytes > AOT_IMAGE_LIMIT)
    throw new RangeError('Invalid fixed native runtime size');
  const codeCapacity = aotSegmentSize(codeBytes), metadataCapacity = aotSegmentSize(metadataBytes + 16);
  // Reserve the worst-case SHA-256 page directory and its fixed metadata.
  const unsignedBytes = fixedBytes + codeCapacity + metadataCapacity;
  const signatureReserve = 512 + Math.ceil(unsignedBytes / 4096) * 32;
  if (unsignedBytes + signatureReserve > AOT_IMAGE_LIMIT)
    throw new RangeError('Native project exceeds the 64 MiB image budget');
  return Object.freeze({codeCapacity, metadataCapacity, unsignedBytes, signatureReserve});
}
