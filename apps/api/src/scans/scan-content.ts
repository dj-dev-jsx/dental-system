import type { Readable } from 'node:stream';
import type { ScanFormat } from '../generated/prisma/client.js';

const HEAD_BYTES = 64 * 1024;

/** Reads up to `bytes` from the start of a stream, then closes it. */
async function readHead(stream: Readable, bytes: number) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    length += chunk.length;
    if (length >= bytes) break;
  }
  stream.destroy();
  return Buffer.concat(chunks).subarray(0, bytes);
}

function isStl(head: Buffer, size: number) {
  // Binary: an 80-byte header, a count of triangles, then 50 bytes for each of them.
  if (head.length >= 84) {
    const triangles = head.readUInt32LE(80);
    if (triangles > 0 && 84 + 50 * triangles === size) return true;
  }
  // ASCII: "solid ...", with at least one facet and vertex, and no binary bytes.
  const text = head.toString('latin1');
  return text.startsWith('solid') && !text.includes('\0') && text.includes('facet') && text.includes('vertex');
}

function isPly(head: Buffer) {
  const text = head.toString('latin1');
  if (!text.startsWith('ply\n') && !text.startsWith('ply\r\n')) return false;
  const end = text.search(/(^|\n)end_header\r?(\n|$)/);
  if (end < 0) return false;
  const lines = text.slice(0, end).split(/\r?\n/);
  if (!lines.some((line) => /^format\s/.test(line))) return false;
  return lines.some((line) => {
    const match = /^element\s+vertex\s+(\d+)\s*$/.exec(line);
    return match !== null && Number(match[1]) > 0;
  });
}

/** An OBJ is text: no NUL bytes anywhere, at least 3 "v " lines and one "f " line. */
async function isObj(stream: Readable) {
  let vertices = 0;
  let faces = 0;
  let carry = '';
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    if (chunk.includes(0)) {
      stream.destroy();
      return false;
    }
    const lines = (carry + chunk.toString('latin1')).split('\n');
    // The last piece may be half a line; only its first characters matter, so keep a few.
    carry = (lines.pop() ?? '').slice(0, 8);
    for (const line of lines) {
      if (line.startsWith('v ')) vertices++;
      else if (line.startsWith('f ')) faces++;
    }
  }
  if (carry.startsWith('v ')) vertices++;
  else if (carry.startsWith('f ')) faces++;
  return vertices >= 3 && faces >= 1;
}

/**
 * Checks that a saved file really is what its extension says, with cheap checks only. The
 * server never opens, renders or executes a scan: it is stored and handed back as bytes.
 */
export async function looksLike(format: ScanFormat, size: number, open: () => Promise<Readable>) {
  if (size <= 0) return false;
  if (format === 'OBJ') return isObj(await open());
  const head = await readHead(await open(), HEAD_BYTES);
  return format === 'STL' ? isStl(head, size) : isPly(head);
}
