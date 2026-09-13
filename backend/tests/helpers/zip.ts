import { inflateRawSync } from 'node:zlib';
import type { Test } from 'supertest';

/** Testlar uchun: ZIP (xlsx) arxivdagi fayllarni nomi bo‘yicha o‘qiydi */
export function readZip(archive: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const endOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0) throw new Error('ZIP oxiri topilmadi');
  const entries = archive.readUInt16LE(endOffset + 10);
  let cursor = archive.readUInt32LE(endOffset + 16);

  for (let index = 0; index < entries; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Markaziy katalog buzilgan');
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataStart, dataStart + compressedSize);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

type BinaryParser = Extract<Parameters<Test['parse']>[0], (res: never, callback: never) => void>;

/** supertest uchun: javobni Buffer sifatida yig‘adi */
export const binaryParser: BinaryParser = (res, callback) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};
