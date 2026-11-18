/// <reference lib="webworker" />
// Runs tooth detection off the page's thread, so a large scan doesn't freeze the screen.
import { detectCore } from './detectCore'
import type { DetectInput, DetectResult } from './detectTypes'

export type DetectReply = { ok: true; result: DetectResult } | { ok: false; message: string }

self.onmessage = (event: MessageEvent<DetectInput>) => {
  let reply: DetectReply
  try {
    reply = { ok: true, result: detectCore(event.data) }
  } catch (error) {
    reply = { ok: false, message: error instanceof Error ? error.message : 'Tooth detection failed.' }
  }
  self.postMessage(reply)
}
