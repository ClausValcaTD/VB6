/** Checked AArch64 integer/ABI encoder. No host tools or runtime emulation. */
import {BinarySection} from './binary-section.js';
const reg = n => {if (!Number.isInteger(n) || n < 0 || n > 31) throw new RangeError('ARM64 register must be 0..31'); return n;};
const imm = (n, min, max, multiple = 1) => {if (!Number.isSafeInteger(n) || n < min || n > max || n % multiple) throw new RangeError('ARM64 immediate is out of range or misaligned'); return n;};
const symbol = n => {if (typeof n !== 'string' || !n) throw new TypeError('ARM64 symbol must be nonempty'); return n;};
export const ARM64_CONDITIONS = Object.freeze({eq:0, ne:1, hs:2, lo:3, mi:4, pl:5, vs:6, vc:7, hi:8, ls:9, ge:10, lt:11, gt:12, le:13, al:14});
export class ARM64 {
  constructor(section = new BinarySection('__text', 0x20)) {this.s = section;}
  word(n) {this.s.u32(imm(n, 0, 0xffffffff)); return this;}
  label(n) {this.s.label(symbol(n)); return this;}
  nop() {return this.word(0xd503201f);}
  ret(n = 30) {return this.word(0xd65f0000 + reg(n) * 32);}
  br(n) {return this.word(0xd61f0000 + reg(n) * 32);}
  blr(n) {return this.word(0xd63f0000 + reg(n) * 32);}
  mov(rd, rn) {reg(rd); reg(rn); return rd === 31 || rn === 31 ? this.add(rd, rn, 0) : this.word(0xaa0003e0 + rn * 65536 + rd);}
  movImm(rd, value) {
    reg(rd); if (rd === 31) throw new RangeError('Cannot load an immediate into SP');
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new RangeError('Unsafe ARM64 immediate');
    if (!['number', 'bigint'].includes(typeof value)) throw new TypeError('Expected an integer immediate');
    const n = BigInt(value); if (n < -(1n << 63n) || n > (1n << 64n) - 1n) throw new RangeError('ARM64 immediate exceeds 64 bits');
    const bits = BigInt.asUintN(64, n);
    this.word(0xd2800000 + Number(bits & 65535n) * 32 + rd);
    for (let shift = 16; shift < 64; shift += 16) {const part = Number((bits >> BigInt(shift)) & 65535n); if (part) this.word(0xf2800000 + (shift / 16) * 0x200000 + part * 32 + rd);}
    return this;
  }
  add(rd, rn, value) {reg(rd); reg(rn); imm(value, 0, 4095); return this.word(0x91000000 + value * 1024 + rn * 32 + rd);}
  sub(rd, rn, value) {reg(rd); reg(rn); imm(value, 0, 4095); return this.word(0xd1000000 + value * 1024 + rn * 32 + rd);}
  cmp(rn, value) {reg(rn); imm(value, 0, 4095); return this.word(0xf100001f + value * 1024 + rn * 32);}
  cmpReg(rn, rm) {reg(rn); reg(rm); return this.word(0xeb00001f + rm * 65536 + rn * 32);}
  cmn(rn, value) {reg(rn); imm(value, 0, 4095); return this.word(0xb100001f + value * 1024 + rn * 32);}
  ldr(rt, rn, offset = 0) {reg(rt); reg(rn); imm(offset, 0, 32760, 8); return this.word(0xf9400000 + offset / 8 * 1024 + rn * 32 + rt);}
  str(rt, rn, offset = 0) {reg(rt); reg(rn); imm(offset, 0, 32760, 8); return this.word(0xf9000000 + offset / 8 * 1024 + rn * 32 + rt);}
  stpPre(rt, rt2, rn, offset = -16) {reg(rt); reg(rt2); reg(rn); imm(offset, -512, 504, 8); return this.word(0xa9800000 + ((offset / 8) & 127) * 32768 + rt2 * 1024 + rn * 32 + rt);}
  ldpPost(rt, rt2, rn, offset = 16) {reg(rt); reg(rt2); reg(rn); imm(offset, -512, 504, 8); if (rt === rt2) throw new RangeError('Overlapping ARM64 load pair'); return this.word(0xa8c00000 + ((offset / 8) & 127) * 32768 + rt2 * 1024 + rn * 32 + rt);}
  fixup(kind, label, instruction, addend = 0) {
    symbol(label); imm(addend, -0x7fffffff, 0x7fffffff);
    this.s.fixups.push({kind, label, offset:this.s.length, addend}); return this.word(instruction);
  }
  b(label) {return this.fixup('arm64-branch26', label, 0x14000000);}
  bl(label) {return this.fixup('arm64-branch26', label, 0x94000000);}
  branch(condition, label) {
    if (!Object.hasOwn(ARM64_CONDITIONS, condition)) throw new RangeError('Unknown ARM64 condition');
    return this.fixup('arm64-cond19', label, 0x54000000 + ARM64_CONDITIONS[condition]);
  }
  address(rd, label, addend = 0) {
    reg(rd); if (rd === 31) throw new RangeError('Cannot address into SP'); symbol(label); imm(addend, -0x7fffffff, 0x7fffffff);
    this.fixup('arm64-page21', label, 0x90000000 + rd, addend);
    return this.fixup('arm64-pageoff12', label, 0x91000000 + rd * 32 + rd, addend);
  }
  enter(frameBytes = 0) {
    imm(frameBytes, 0, 32752, 16);
    this.stpPre(29, 30, 31).mov(29, 31).stpPre(19, 20, 31).mov(19, 0);
    // Do not jump over the stack guard. All call sites retain 16-byte alignment.
    for (let n = frameBytes; n; n -= Math.min(n, 4080)) this.sub(31, 31, Math.min(n, 4080)).str(31, 31);
    return this;
  }
  leave(frameBytes = 0) {
    imm(frameBytes, 0, 32752, 16);
    for (let n = frameBytes; n; n -= Math.min(n, 4080)) this.add(31, 31, Math.min(n, 4080));
    return this.ldpPost(19, 20, 31).ldpPost(29, 30, 31).ret();
  }
}
function address(n) {
  if (typeof n === 'number' && !Number.isSafeInteger(n)) throw new RangeError('Unsafe ARM64 address');
  if (!['number', 'bigint'].includes(typeof n)) throw new TypeError('Invalid ARM64 address');
  const value = BigInt(n); if (value < 0n || value > 0xffffffffffffffffn) throw new RangeError('Invalid ARM64 address'); return value;
}
/** Resolve into a copy: failed linking never mutates the input section. */
export function linkARM64(section, baseAddress, externalSymbols = new Map()) {
  const base = address(baseAddress), labels = new Map();
  for (const [name, value] of externalSymbols) labels.set(name, address(value));
  for (const [name, offset] of section.labels) {
    imm(offset, 0, section.length); if (labels.has(name)) throw new Error('Duplicate ARM64 symbol: ' + name); labels.set(name, base + BigInt(offset));
  }
  const output = Uint8Array.from(section.bytes), view = new DataView(output.buffer), used = new Set();
  for (const f of section.fixups) {
    imm(f.offset, 0, section.length - 4, 4); imm(f.addend, -0x7fffffff, 0x7fffffff);
    if (used.has(f.offset)) throw new Error('Overlapping ARM64 relocations'); used.add(f.offset);
    if (!labels.has(f.label)) throw new Error('Undefined ARM64 symbol: ' + f.label);
    const target = labels.get(f.label) + BigInt(f.addend), pc = base + BigInt(f.offset);
    if (target < 0n || target > 0xffffffffffffffffn) throw new RangeError('ARM64 target outside address space');
    let word = view.getUint32(f.offset, true);
    if (f.kind === 'arm64-branch26' || f.kind === 'arm64-cond19') {
      const delta = target - pc, width = f.kind === 'arm64-branch26' ? 26 : 19;
      const units = delta / 4n;
      if (delta % 4n || units < -(1n << BigInt(width-1)) || units >= (1n << BigInt(width-1))) throw new RangeError('ARM64 branch target out of range or misaligned');
      if (width === 26) {if ((word & 0x7c000000) !== 0x14000000) throw new Error('ARM64 branch relocation opcode mismatch'); word = ((word & 0xfc000000) | Number(BigInt.asUintN(26, units))) >>> 0;}
      else {if ((word & 0xff000010) >>> 0 !== 0x54000000) throw new Error('ARM64 conditional relocation opcode mismatch'); word = ((word & 0xff00001f) | Number(BigInt.asUintN(19, units)) * 32) >>> 0;}
    } else if (f.kind === 'arm64-page21') {
      const pages = (target >> 12n) - (pc >> 12n);
      if (pages < -(1n << 20n) || pages >= (1n << 20n)) throw new RangeError('ARM64 page target out of range');
      if ((word & 0x9f000000) >>> 0 !== 0x90000000) throw new Error('ARM64 page relocation opcode mismatch');
      const bits = Number(BigInt.asUintN(21, pages)); word = ((word & 31) | 0x90000000 | (bits & 3) * 0x20000000 | (bits >>> 2) * 32) >>> 0;
    } else if (f.kind === 'arm64-pageoff12') {
      if ((word & 0xffc00000) >>> 0 !== 0x91000000) throw new Error('ARM64 page offset relocation opcode mismatch');
      word = ((word & 0xffc003ff) | Number(target & 4095n) * 1024) >>> 0;
    } else throw new Error('Unsupported ARM64 relocation: ' + f.kind);
    view.setUint32(f.offset, word, true);
  }
  return output;
}
