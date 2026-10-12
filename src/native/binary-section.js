/** Shared deterministic byte storage for native target assemblers. */
const align = (n, a) => Math.ceil(n / a) * a;
export class BinarySection {
  constructor(name, flags) { this.name = name; this.flags = flags; this.bytes = []; this.labels = new Map(); this.fixups = []; }
  get length() { return this.bytes.length; }
  emit(...values) { for (const value of values) this.bytes.push(value & 255); return this; }
  u16(n) { return this.emit(n, n >>> 8); }
  u32(n) { return this.emit(n, n >>> 8, n >>> 16, n >>> 24); }
  zero(n) { if (!Number.isInteger(n) || n < 0 || n > 16 * 1024 * 1024) throw new Error('Invalid section allocation'); for (let i = 0; i < n; i++) this.bytes.push(0); return this; }
  align(n) { return this.zero(align(this.length, n) - this.length); }
  label(name) { if (this.labels.has(name)) throw new Error('Duplicate label: ' + name); this.labels.set(name, this.length); return this; }
  reference(label, kind = 'va', addend = 0) {
    if (typeof label !== 'string' || !label || !['va','rva','rel','rel8'].includes(kind) || !Number.isSafeInteger(addend) || addend < -2147483648 || addend > 4294967295) throw new Error('Invalid native relocation');
    this.fixups.push({ offset: this.length, label, kind, addend }); return kind === 'rel8' ? this.emit(0) : this.u32(0);
  }
  ascii(text) { if (!/^[\x20-\x7e]*$/.test(text)) throw new Error('Expected ASCII'); return this.emit(...new TextEncoder().encode(text), 0); }
  utf16(text) { for (let i = 0; i < text.length; i++) this.u16(text.charCodeAt(i)); return this.u16(0); }
}
