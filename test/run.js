'use strict';

const assert = require('node:assert/strict');
const { applyVcdiff } = require('../src/vcdiff');
const { createZip, crc32 } = require('../src/zip');

const encoder = new TextEncoder();
const source = encoder.encode('abc');
const patch = new Uint8Array([
  0xd6, 0xc3, 0xc4, 0x00, 0x00,
  0x01, 0x03, 0x00, 0x0a, 0x04, 0x00, 0x01, 0x03, 0x01,
  0x21, 0x13, 0x03, 0x02, 0x00
]);
assert.equal(new TextDecoder().decode(applyVcdiff(source, patch)), 'abc!');
assert.equal(crc32(encoder.encode('123456789')), 0xcbf43926);

const zip = createZip([
  { name: 'DATA/hello.txt', data: encoder.encode('hello') },
  { name: '한글.bmp', data: new Uint8Array([0, 1, 2]) }
]);
assert.equal(zip[0], 0x50);
assert.equal(zip[1], 0x4b);
assert.throws(() => createZip([{ name: '../escape', data: new Uint8Array() }]), /안전하지 않은/);
console.log('Web patcher unit tests passed.');
