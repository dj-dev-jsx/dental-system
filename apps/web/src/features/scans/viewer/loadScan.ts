import { scanFileUrl } from '../api'
import type { ScanFormat } from '../types'
import type { ParsedMesh, ParseRequest, ParseResponse } from './parseTypes'

export type LoadProgress = { loaded: number; total: number }

/** Why a scan didn't open, so the screen can say the right thing. */
export class ScanLoadError extends Error {
  readonly kind: 'network' | 'parse' | 'withdrawn' | 'forbidden' | 'missing' | 'server'
  constructor(kind: ScanLoadError['kind']) {
    super(kind)
    this.kind = kind
  }
}

async function download(url: string, expected: number, signal: AbortSignal, onProgress: (p: LoadProgress) => void): Promise<ArrayBuffer> {
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ScanLoadError('network')
  }
  if (!response.ok) {
    if (response.status === 410) throw new ScanLoadError('withdrawn')
    if (response.status === 403 || response.status === 401) throw new ScanLoadError('forbidden')
    if (response.status === 404) throw new ScanLoadError('missing')
    throw new ScanLoadError('server')
  }
  const header = Number(response.headers.get('content-length'))
  const total = header > 0 ? header : expected
  if (!response.body) {
    const buffer = await response.arrayBuffer()
    onProgress({ loaded: buffer.byteLength, total: buffer.byteLength })
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onProgress({ loaded, total: Math.max(total, loaded) })
    }
  } catch (error) {
    if (signal.aborted) throw error
    throw new ScanLoadError('network')
  }
  // One copy into a single block, which is then handed to the worker without another.
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  chunks.length = 0
  return bytes.buffer
}

/**
 * Fetches the scan with progress, then reads it in a worker. Aborting the signal stops the
 * download and ends the worker.
 */
export async function loadScan(
  patientId: string,
  scanId: string,
  format: ScanFormat,
  sizeBytes: number,
  signal: AbortSignal,
  onProgress: (p: LoadProgress) => void,
  onParsing: () => void,
): Promise<ParsedMesh> {
  const buffer = await download(scanFileUrl(patientId, scanId), sizeBytes, signal, onProgress)
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  if (buffer.byteLength === 0) throw new ScanLoadError('parse')
  onParsing()
  return new Promise<ParsedMesh>((resolve, reject) => {
    const worker = new Worker(new URL('./parseWorker.ts', import.meta.url), { type: 'module' })
    const stop = () => {
      worker.terminate()
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    signal.addEventListener('abort', stop, { once: true })
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      signal.removeEventListener('abort', stop)
      worker.terminate()
      if (event.data.ok) resolve(event.data.mesh)
      else reject(new ScanLoadError('parse'))
    }
    worker.onerror = () => {
      signal.removeEventListener('abort', stop)
      worker.terminate()
      reject(new ScanLoadError('parse'))
    }
    const request: ParseRequest = { buffer, format }
    worker.postMessage(request, [buffer])
  })
}
