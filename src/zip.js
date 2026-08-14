'use strict';

(function exposeZip(root) {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[index] = value >>> 0;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function write16(view, offset, value) { view.setUint16(offset, value, true); }
  function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

  function createZip(entries) {
    const normalized = entries.map((entry) => ({
      name: entry.name.replaceAll('\\', '/'),
      nameBytes: encoder.encode(entry.name.replaceAll('\\', '/')),
      data: entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data)
    }));
    let localSize = 0;
    let centralSize = 0;
    for (const entry of normalized) {
      if (!entry.name || entry.name.startsWith('/') || entry.name.split('/').includes('..')) throw new Error(`안전하지 않은 ZIP 경로입니다: ${entry.name}`);
      if (entry.data.length > 0xffffffff) throw new Error('ZIP32에서 지원하지 않는 파일 크기입니다.');
      entry.crc = crc32(entry.data);
      entry.offset = localSize;
      localSize += 30 + entry.nameBytes.length + entry.data.length;
      centralSize += 46 + entry.nameBytes.length;
    }
    const totalSize = localSize + centralSize + 22;
    if (totalSize > 0xffffffff || normalized.length > 0xffff) throw new Error('ZIP32 크기 제한을 초과했습니다.');
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);
    let offset = 0;
    for (const entry of normalized) {
      write32(view, offset, 0x04034b50); write16(view, offset + 4, 20); write16(view, offset + 6, 0x0800);
      write16(view, offset + 8, 0); write16(view, offset + 10, 0); write16(view, offset + 12, 0);
      write32(view, offset + 14, entry.crc); write32(view, offset + 18, entry.data.length); write32(view, offset + 22, entry.data.length);
      write16(view, offset + 26, entry.nameBytes.length); write16(view, offset + 28, 0);
      output.set(entry.nameBytes, offset + 30); output.set(entry.data, offset + 30 + entry.nameBytes.length);
      offset += 30 + entry.nameBytes.length + entry.data.length;
    }
    const centralOffset = offset;
    for (const entry of normalized) {
      write32(view, offset, 0x02014b50); write16(view, offset + 4, 20); write16(view, offset + 6, 20);
      write16(view, offset + 8, 0x0800); write16(view, offset + 10, 0); write16(view, offset + 12, 0); write16(view, offset + 14, 0);
      write32(view, offset + 16, entry.crc); write32(view, offset + 20, entry.data.length); write32(view, offset + 24, entry.data.length);
      write16(view, offset + 28, entry.nameBytes.length); write16(view, offset + 30, 0); write16(view, offset + 32, 0);
      write16(view, offset + 34, 0); write16(view, offset + 36, 0); write32(view, offset + 38, 0); write32(view, offset + 42, entry.offset);
      output.set(entry.nameBytes, offset + 46);
      offset += 46 + entry.nameBytes.length;
    }
    write32(view, offset, 0x06054b50); write16(view, offset + 4, 0); write16(view, offset + 6, 0);
    write16(view, offset + 8, normalized.length); write16(view, offset + 10, normalized.length);
    write32(view, offset + 12, centralSize); write32(view, offset + 16, centralOffset); write16(view, offset + 20, 0);
    return output;
  }

  const api = { createZip, crc32 };
  root.SimpleZip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : globalThis));
