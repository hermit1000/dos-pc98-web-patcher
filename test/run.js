'use strict';

const assert = require('node:assert/strict');
const { applyVcdiff } = require('../src/vcdiff');
const { createZip, crc32 } = require('../src/zip');
const { matchMissingTargetsByHash } = require('../src/file-match');

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
async function testRenamedFiles() {
  const diskA = { name: 'renamed-a.d88', size: 2, hash: 'a' };
  const diskB = { name: 'renamed-b.d88', size: 2, hash: 'b' };
  const targets = [
    { target: { originalSize: 2, patchedSize: 2, originalSha256: 'a', patchedSha256: 'A' } },
    { target: { originalSize: 2, patchedSize: 2, originalSha256: 'b', patchedSha256: 'B' } }
  ];
  await matchMissingTargetsByHash(targets, [{ file: diskB }, { file: diskA }], async (file) => file.hash);
  assert.equal(targets[0].file, diskA);
  assert.equal(targets[1].file, diskB);
  assert.equal(targets[0].matchedByHash, true);

  const duplicate = [{ target: targets[0].target }];
  await matchMissingTargetsByHash(duplicate, [{ file: diskA }, { file: { ...diskA } }], async (file) => file.hash);
  assert.equal(duplicate[0].file, undefined);
  assert.equal(duplicate[0].ambiguous, true);
}

testRenamedFiles().then(() => console.log('Web patcher unit tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
