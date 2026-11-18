// Automatic tooth detection: where each tooth is on a scan and its FDI number, so the dentist
// confirms or corrects instead of clicking every tooth. The work runs in a Web Worker (a large
// scan takes a few hundred milliseconds), on a copy of the scan's arrays.
import type { DetectInput, DetectResult } from './detectTypes'
import type { DetectReply } from './detectWorker'

export type { Arch, DetectedTooth, DetectInput, DetectResult } from './detectTypes'

/**
 * Finds the teeth on a scan.
 *
 * How to use the confidences (calibrated on labelled scans; see the evaluation notes):
 * - `confidence` >= 0.6 and `archConfidence` >= 0.9: ask "Looks right?" with all pins shown
 *   (about 98% of such teeth were right on labelled scans).
 * - otherwise: show the pins but ask the dentist to check them, and show `notes`.
 * - Either way, highlight teeth whose own `confidence` is below 0.7 (about 2 in 3 right);
 *   below 0.3 a pin is mostly a guess (about 1 in 8 right).
 * - `archConfidence` < 0.9: ask which arch it is first (the numbers flip with it).
 *
 * Rejects with an AbortError when `signal` aborts (the worker is stopped at once).
 */
export function detectTeeth(input: DetectInput, signal?: AbortSignal): Promise<DetectResult> {
  return new Promise<DetectResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Tooth detection was cancelled.', 'AbortError'))
      return
    }
    const worker = new Worker(new URL('./detectWorker.ts', import.meta.url), { type: 'module' })
    const finish = () => {
      worker.terminate()
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      finish()
      reject(new DOMException('Tooth detection was cancelled.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onmessage = (event: MessageEvent<DetectReply>) => {
      finish()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.message))
    }
    worker.onerror = (event) => {
      finish()
      reject(new Error(event.message || 'Tooth detection failed.'))
    }
    // Copies, handed over to the worker: the viewer keeps its own arrays.
    const positions = input.positions.slice()
    const index = input.index ? input.index.slice() : null
    const colors = input.colors ? input.colors.slice() : null
    const transfer: Transferable[] = [positions.buffer]
    if (index) transfer.push(index.buffer)
    if (colors) transfer.push(colors.buffer)
    const request: DetectInput = { positions, index, colors, unitsPerMm: input.unitsPerMm, arch: input.arch }
    worker.postMessage(request, transfer)
  })
}
