'use strict';

(function exposeVcdiff(root) {
  const MAGIC = [0xd6, 0xc3, 0xc4, 0x00];
  const NOOP = 0;
  const ADD = 1;
  const RUN = 2;
  const COPY = 3;

  class Reader {
    constructor(bytes, start = 0, end = bytes.length) {
      this.bytes = bytes;
      this.offset = start;
      this.end = end;
    }

    byte() {
      if (this.offset >= this.end) throw new Error('VCDIFF 데이터가 예기치 않게 끝났습니다.');
      return this.bytes[this.offset++];
    }

    varInt() {
      let value = 0;
      for (let count = 0; count < 10; count += 1) {
        const next = this.byte();
        value = value * 128 + (next & 0x7f);
        if (!Number.isSafeInteger(value)) throw new Error('VCDIFF 정수가 너무 큽니다.');
        if (!(next & 0x80)) return value;
      }
      throw new Error('잘못된 VCDIFF 정수입니다.');
    }

    uint32() {
      return (((this.byte() << 24) >>> 0) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0;
    }

    skip(length) {
      if (length < 0 || this.offset + length > this.end) throw new Error('VCDIFF 영역 크기가 잘못되었습니다.');
      this.offset += length;
    }
  }

  function defaultCodeTable() {
    const table = [];
    const noop = () => ({ type: NOOP, size: 0, mode: 0 });
    table.push([{ type: RUN, size: 0, mode: 0 }, noop()]);
    for (let size = 0; size < 18; size += 1) table.push([{ type: ADD, size, mode: 0 }, noop()]);
    for (let mode = 0; mode < 9; mode += 1) {
      table.push([{ type: COPY, size: 0, mode }, noop()]);
      for (let size = 4; size < 19; size += 1) table.push([{ type: COPY, size, mode }, noop()]);
    }
    for (let mode = 0; mode < 6; mode += 1) {
      for (let addSize = 1; addSize < 5; addSize += 1) {
        for (let copySize = 4; copySize < 7; copySize += 1) {
          table.push([{ type: ADD, size: addSize, mode: 0 }, { type: COPY, size: copySize, mode }]);
        }
      }
    }
    for (let mode = 6; mode < 9; mode += 1) {
      for (let addSize = 1; addSize < 5; addSize += 1) {
        table.push([{ type: ADD, size: addSize, mode: 0 }, { type: COPY, size: 4, mode }]);
      }
    }
    for (let mode = 0; mode < 9; mode += 1) {
      table.push([{ type: COPY, size: 4, mode }, { type: ADD, size: 1, mode: 0 }]);
    }
    if (table.length !== 256) throw new Error('내부 VCDIFF 코드 테이블 오류입니다.');
    return table;
  }

  const CODE_TABLE = defaultCodeTable();

  function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (let index = 0; index < bytes.length; index += 1) {
      a = (a + bytes[index]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  function concat(chunks, totalLength) {
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  function applyVcdiff(sourceInput, patchInput) {
    const source = sourceInput instanceof Uint8Array ? sourceInput : new Uint8Array(sourceInput);
    const patch = patchInput instanceof Uint8Array ? patchInput : new Uint8Array(patchInput);
    const reader = new Reader(patch);
    for (const expected of MAGIC) {
      if (reader.byte() !== expected) throw new Error('지원하지 않는 xdelta/VCDIFF 파일입니다.');
    }

    const headerIndicator = reader.byte();
    if (headerIndicator & 0x01) throw new Error('보조 압축을 사용하는 VCDIFF는 지원하지 않습니다.');
    if (headerIndicator & 0x02) throw new Error('사용자 코드 테이블 VCDIFF는 지원하지 않습니다.');
    if (headerIndicator & 0x04) reader.skip(reader.varInt());

    const outputChunks = [];
    let outputLength = 0;
    while (reader.offset < reader.end) {
      const windowIndicator = reader.byte();
      let sourceLength = 0;
      let sourcePosition = 0;
      if (windowIndicator & 0x03) {
        sourceLength = reader.varInt();
        sourcePosition = reader.varInt();
      }
      reader.varInt(); // delta encoding length
      const targetLength = reader.varInt();
      const deltaIndicator = reader.byte();
      if (deltaIndicator !== 0) throw new Error('압축된 VCDIFF 구간은 지원하지 않습니다.');
      const dataLength = reader.varInt();
      const instructionLength = reader.varInt();
      const addressLength = reader.varInt();
      const expectedChecksum = windowIndicator & 0x04 ? reader.uint32() : null;

      const dataStart = reader.offset;
      const instructionStart = dataStart + dataLength;
      const addressStart = instructionStart + instructionLength;
      const windowEnd = addressStart + addressLength;
      if (windowEnd > reader.end) throw new Error('VCDIFF 구간이 파일 범위를 벗어납니다.');

      let sourceSegment;
      if (windowIndicator & 0x01) {
        if (sourcePosition + sourceLength > source.length) throw new Error('VCDIFF 원본 구간이 파일 범위를 벗어납니다.');
        sourceSegment = source.subarray(sourcePosition, sourcePosition + sourceLength);
      } else if (windowIndicator & 0x02) {
        const previousOutput = concat(outputChunks, outputLength);
        if (sourcePosition + sourceLength > previousOutput.length) throw new Error('VCDIFF 대상 구간이 결과 범위를 벗어납니다.');
        sourceSegment = previousOutput.subarray(sourcePosition, sourcePosition + sourceLength);
      } else {
        sourceSegment = new Uint8Array(0);
      }

      const dataReader = new Reader(patch, dataStart, instructionStart);
      const instructionReader = new Reader(patch, instructionStart, addressStart);
      const addressReader = new Reader(patch, addressStart, windowEnd);
      const target = new Uint8Array(targetLength);
      let targetOffset = 0;
      const near = new Array(4).fill(0);
      const same = new Array(3 * 256).fill(0);
      let nextNear = 0;

      function decodeAddress(mode) {
        const here = sourceSegment.length + targetOffset;
        let address;
        if (mode === 0) address = addressReader.varInt();
        else if (mode === 1) address = here - addressReader.varInt();
        else if (mode < 6) address = near[mode - 2] + addressReader.varInt();
        else address = same[(mode - 6) * 256 + addressReader.byte()];
        if (!Number.isSafeInteger(address) || address < 0) throw new Error('잘못된 VCDIFF 복사 주소입니다.');
        near[nextNear] = address;
        nextNear = (nextNear + 1) % near.length;
        same[address % same.length] = address;
        return address;
      }

      while (instructionReader.offset < instructionReader.end) {
        const entry = CODE_TABLE[instructionReader.byte()];
        for (const instruction of entry) {
          if (instruction.type === NOOP) continue;
          const size = instruction.size || instructionReader.varInt();
          if (targetOffset + size > target.length) throw new Error('VCDIFF 결과 크기가 manifest와 맞지 않습니다.');
          if (instruction.type === ADD) {
            for (let count = 0; count < size; count += 1) target[targetOffset++] = dataReader.byte();
          } else if (instruction.type === RUN) {
            const value = dataReader.byte();
            target.fill(value, targetOffset, targetOffset + size);
            targetOffset += size;
          } else if (instruction.type === COPY) {
            let address = decodeAddress(instruction.mode);
            for (let count = 0; count < size; count += 1) {
              if (address < sourceSegment.length) {
                target[targetOffset++] = sourceSegment[address++];
              } else {
                const targetAddress = address++ - sourceSegment.length;
                if (targetAddress < 0 || targetAddress >= targetOffset) throw new Error('VCDIFF 복사 대상이 아직 생성되지 않았습니다.');
                target[targetOffset++] = target[targetAddress];
              }
            }
          }
        }
      }
      if (targetOffset !== target.length) throw new Error('VCDIFF 결과가 예상 크기보다 작습니다.');
      if (dataReader.offset !== dataReader.end || addressReader.offset !== addressReader.end) throw new Error('VCDIFF 구간에 사용하지 않은 데이터가 있습니다.');
      if (expectedChecksum !== null && adler32(target) !== expectedChecksum) throw new Error('VCDIFF Adler-32 검증에 실패했습니다.');
      outputChunks.push(target);
      outputLength += target.length;
      reader.offset = windowEnd;
    }
    return concat(outputChunks, outputLength);
  }

  const api = { applyVcdiff };
  root.Vcdiff = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : globalThis));
