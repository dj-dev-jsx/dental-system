import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buttonOnDark, buttonOutline } from '../../../components/buttons'
import { ErrorBox } from '../../../components/ErrorBox'
import { type FdiCode, toothName } from '../../dental-chart/model/fdi'
import { useLeaveGuard } from '../../clinic/useLeaveGuard'
import { useSaveScanPins } from '../api'
import { scanErrorCode, scanErrorMessage } from '../errors'
import type { Scan } from '../types'
import { ARCH_ORDER, type Arch, guessArch, orderFor, toFile, type Vec3, type ViewPin } from '../viewer/pinMath'
import type { StageLayer } from '../viewer/ScanStage'

type Props = {
  patientId: string
  scan: Scan
  layer: StageLayer
  pins: ViewPin[]
  onPins: (pins: ViewPin[]) => void
  panel: HTMLElement | null
  onDone: () => void
}

type Snapshot = { pins: ViewPin[]; skipped: FdiCode[] }

const barButton =
  'inline-flex h-9 items-center justify-center rounded-md border border-white/25 px-3 text-sm font-medium text-neutral-200 outline-white transition-colors duration-150 hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-600 pointer-coarse:h-11'

const ARCHES: [Arch, string][] = [
  ['upper', 'Upper'],
  ['lower', 'Lower'],
  ['both', 'Both'],
]

const samePins = (a: ViewPin[], b: ViewPin[]) =>
  a.length === b.length && a.every((p) => b.some((q) => q.tooth === p.tooth && q.at.every((v, i) => v === p.at[i])))

/**
 * Marking mode: the dentist clicks the middle of each tooth in turn, as the app suggests the
 * next number. Pins can be dragged, removed, skipped or placed for any number. Nothing is
 * detected automatically. Saved all at once.
 */
export function MarkTeeth({ patientId, scan, layer, pins, onPins, panel, onDone }: Props) {
  const { viewer } = layer
  const [initial] = useState(pins)
  const [arch, setArch] = useState<Arch>(() => guessArch(scan.title, pins))
  const [skipped, setSkipped] = useState<FdiCode[]>([])
  const [history, setHistory] = useState<Snapshot[]>([])
  const [manual, setManual] = useState<FdiCode | null>(null)
  const [active, setActive] = useState<FdiCode | null>(null)
  const [picking, setPicking] = useState(false)
  const [asking, setAsking] = useState(false)
  const [, setTick] = useState(0)
  const save = useSaveScanPins(patientId, scan.id)
  const dirty = !samePins(pins, initial)
  const guard = useLeaveGuard(dirty)

  useEffect(() => viewer.onViewChange(() => setTick((n) => (n + 1) % 1e6)), [viewer])

  const placed = new Set(pins.map((p) => p.tooth))
  const order = orderFor(arch)
  const target = manual ?? order.find((t) => !placed.has(t) && !skipped.includes(t)) ?? null

  const remember = () => setHistory((h) => [...h.slice(-99), { pins, skipped }])
  const place = (tooth: FdiCode, at: Vec3) => {
    remember()
    onPins([...pins.filter((p) => p.tooth !== tooth), { tooth, at }])
    setManual(null)
    setActive(null)
  }
  const remove = (tooth: FdiCode) => {
    remember()
    onPins(pins.filter((p) => p.tooth !== tooth))
    setActive(null)
  }
  const skip = () => {
    if (!target) return
    remember()
    setSkipped((s) => [...s, target])
    setManual(null)
  }
  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    onPins(last.pins)
    setSkipped(last.skipped)
    setManual(null)
    setActive(null)
  }
  const cancel = () => (dirty ? setAsking(true) : onDone())

  // Refs so the canvas listeners always see the latest state.
  const latest = useRef({ target, place })
  useEffect(() => {
    latest.current = { target, place }
  })

  // A tap or click on the surface places the suggested tooth there.
  useEffect(() => {
    const canvas = viewer.canvas
    const down: { at: { x: number; y: number; t: number } | null } = { at: null }
    const onDown = (e: PointerEvent) => {
      down.at = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null
    }
    const onUp = (e: PointerEvent) => {
      const start = down.at
      down.at = null
      if (!start || e.button !== 0 || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6 || performance.now() - start.t > 600) return
      const { target: tooth, place: put } = latest.current
      if (!tooth) return
      const hit = viewer.pick(e.clientX, e.clientY)
      if (hit) put(tooth, hit)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    viewer.setCursor('crosshair')
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      viewer.setCursor('')
    }
  }, [viewer])

  // Esc closes the number picker, then cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (picking) setPicking(false)
      else if (asking) setAsking(false)
      else if (dirty) setAsking(true)
      else onDone()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [picking, asking, dirty, onDone])

  // Dragging a pin: it follows the pointer over the surface; the camera stays still meanwhile.
  const drag = useRef<{ tooth: FdiCode; id: number; moved: boolean; start: ViewPin[]; x: number; y: number } | null>(null)
  const frame = useRef(0)
  const onPinDown = (tooth: FdiCode) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    viewer.setControlsEnabled(false)
    drag.current = { tooth, id: e.pointerId, moved: false, start: pins, x: e.clientX, y: e.clientY }
  }
  const onPinMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
    d.moved = true
    const { clientX, clientY } = e
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const hit = viewer.pick(clientX, clientY)
      if (hit && drag.current) onPins([...drag.current.start.filter((p) => p.tooth !== d.tooth), { tooth: d.tooth, at: hit }])
    })
  }
  const onPinUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    viewer.setControlsEnabled(true)
    if (d.moved) setHistory((h) => [...h.slice(-99), { pins: d.start, skipped }])
    else setActive((now) => (now === d.tooth ? null : d.tooth))
  }
  useEffect(() => () => viewer.setControlsEnabled(true), [viewer])

  const submit = () => {
    save.mutate(pins.map((p) => toFile(p, layer.mesh.transform)), { onSuccess: onDone })
  }

  const stage = { width: viewer.canvas.clientWidth, height: viewer.canvas.clientHeight }
  const verb = window.matchMedia?.('(pointer: coarse)').matches ? 'Tap' : 'Click'
  const prompt = target
    ? `${verb} the middle of tooth ${target}`
    : pins.length === 0
      ? 'Every tooth was skipped'
      : 'All teeth in this arch are marked or skipped'
  const saveError = save.isError
    ? scanErrorCode(save.error) === 'SCAN_WITHDRAWN'
      ? 'This scan was withdrawn, so its teeth can’t be changed.'
      : scanErrorMessage(save.error)
    : null

  return (
    <>
      {/* The pins being placed: larger, white, and draggable. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pins.map((pin) => {
          const at = viewer.project(pin.at)
          if (!at || at.x < 0 || at.y < 0 || at.x > stage.width || at.y > stage.height) return null
          const on = active === pin.tooth
          return (
            <button
              key={pin.tooth}
              type="button"
              aria-label={`Tooth ${pin.tooth}. Drag to move${on ? '' : ', or press to choose'}`}
              aria-pressed={on}
              onPointerDown={onPinDown(pin.tooth)}
              onPointerMove={onPinMove}
              onPointerUp={onPinUp}
              onPointerCancel={onPinUp}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActive((now) => (now === pin.tooth ? null : pin.tooth))
                }
                if (e.key === 'Delete' || e.key === 'Backspace') remove(pin.tooth)
              }}
              className="pointer-events-auto absolute grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full outline-white select-none focus-visible:outline-2 active:cursor-grabbing"
              style={{ left: at.x, top: at.y }}
            >
              <span
                className={`grid size-7 place-items-center rounded-full text-xs font-bold tabular-nums shadow-[0_1px_3px_rgb(0_0_0/0.6)] ${
                  on ? 'bg-neutral-950 text-white ring-2 ring-white' : 'bg-white text-neutral-950'
                }`}
              >
                {pin.tooth}
              </span>
            </button>
          )
        })}
      </div>

      {/* The prompt and the main actions, across the top of the stage. */}
      <div className="absolute inset-x-2 top-2 z-20 rounded-md border border-white/20 bg-neutral-950/85 p-2.5 text-white sm:inset-x-3 sm:top-3 sm:p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1" aria-live="polite" role="status">
            <p className="text-base font-semibold sm:text-lg">
              {active ? `Tooth ${active} chosen` : prompt}
            </p>
            <p className="truncate text-sm text-neutral-400">
              {active
                ? 'Drag it to move it, or remove it.'
                : target
                  ? `${toothName(target)}${manual ? ' · chosen by hand' : ''}`
                  : 'Save, or choose a number to place it again.'}
            </p>
          </div>
          <div className="flex rounded-md border border-white/20 p-0.5" role="group" aria-label="Arch">
            {ARCHES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={arch === value}
                onClick={() => {
                  setArch(value)
                  setManual(null)
                }}
                className={`h-8 rounded px-2.5 text-sm font-medium outline-white focus-visible:outline-2 pointer-coarse:h-11 ${
                  arch === value ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {active ? (
            <>
              <button type="button" onClick={() => remove(active)} className={barButton}>
                Remove {active}
              </button>
              <button type="button" onClick={() => setActive(null)} className={barButton}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={skip} disabled={!target} className={barButton}>
                Skip{target ? ` ${target}` : ''}
              </button>
              <button type="button" onClick={undo} disabled={history.length === 0} className={barButton}>
                Undo
              </button>
              <button type="button" aria-expanded={picking} aria-controls="tooth-picker" onClick={() => setPicking((on) => !on)} className={barButton}>
                Choose number
              </button>
            </>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={cancel} className={barButton}>
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={save.isPending} className={`${buttonOnDark} h-9 px-4 text-sm pointer-coarse:h-11`}>
              {save.isPending ? 'Saving…' : 'Save teeth'}
            </button>
          </span>
        </div>

        {picking && (
          <TeethPicker
            placed={placed}
            current={target}
            onPick={(tooth) => {
              setManual(tooth)
              setActive(null)
              setPicking(false)
            }}
          />
        )}

        {asking && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm" role="alert">
            <span className="mr-auto font-semibold">Discard the changes to the teeth?</span>
            <button type="button" autoFocus onClick={onDone} className={barButton}>
              Discard
            </button>
            <button type="button" onClick={() => setAsking(false)} className={barButton}>
              Keep marking
            </button>
          </div>
        )}
        {guard.leaveTo && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm" role="alert">
            <span className="mr-auto font-semibold">Leave without saving the teeth?</span>
            <button type="button" autoFocus onClick={guard.leave} className={barButton}>
              Leave
            </button>
            <button type="button" onClick={guard.stay} className={barButton}>
              Stay
            </button>
          </div>
        )}
        {saveError && <p className="mt-2.5 rounded bg-white px-3 py-2 text-sm font-medium text-neutral-950" role="alert">{saveError}</p>}
      </div>

      {panel &&
        createPortal(
          <section aria-label="Marking teeth" className="px-5 py-5 lg:px-6">
            <h2 className="text-xl font-bold tracking-[-0.02em]">Marking teeth</h2>
            <p className="mt-1 text-sm/6 text-neutral-600">
              Click the middle of each tooth as its number comes up. Skip teeth that are missing or not in the scan. Drag a pin to move it. Afterwards, clicking anywhere on a tooth opens its chart.
            </p>
            <h3 className="mt-6 text-sm font-semibold">
              Marked <span className="font-normal text-neutral-600 tabular-nums">· {pins.length}</span>
            </h3>
            {pins.length === 0 ? (
              <p className="mt-2 border-t border-neutral-950 py-3 text-sm text-neutral-600">No teeth marked yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-200 border-t border-neutral-950 text-sm">
                {[...ARCH_ORDER.upper, ...ARCH_ORDER.lower]
                  .filter((t) => placed.has(t))
                  .map((tooth) => (
                    <li key={tooth} className="flex items-center gap-3 py-1.5">
                      <span className="w-6 font-semibold tabular-nums">{tooth}</span>
                      <span className="min-w-0 flex-1 truncate text-neutral-600">{toothName(tooth)}</span>
                      <button type="button" onClick={() => remove(tooth)} className={`${buttonOutline} h-8 px-2.5 text-sm pointer-coarse:h-11`} aria-label={`Remove tooth ${tooth}`}>
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {skipped.length > 0 && <p className="mt-3 text-sm text-neutral-600">Skipped: {skipped.join(', ')}</p>}
            {saveError && <ErrorBox className="mt-4">{saveError}</ErrorBox>}
          </section>,
          panel,
        )}
    </>
  )
}

/** Every adult tooth as a button, in chart order (18 to 28 over 48 to 38). */
function TeethPicker({ placed, current, onPick }: { placed: Set<FdiCode>; current: FdiCode | null; onPick: (tooth: FdiCode) => void }) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  return (
    <div id="tooth-picker" role="group" aria-label="Choose the tooth to place" className="mt-2.5 border-t border-white/15 pt-2.5">
      {(['upper', 'lower'] as const).map((row) => (
        <div key={row} className="grid grid-cols-8 gap-1 sm:grid-cols-16 [&+&]:mt-1">
          {ARCH_ORDER[row].map((tooth, i) => (
            <button
              key={tooth}
              ref={row === 'upper' && i === 0 ? first : undefined}
              type="button"
              onClick={() => onPick(tooth)}
              aria-label={`${tooth}, ${toothName(tooth)}${placed.has(tooth) ? ', marked' : ''}`}
              aria-current={current === tooth || undefined}
              className={`h-9 rounded text-sm font-semibold tabular-nums outline-white focus-visible:outline-2 pointer-coarse:h-11 ${
                current === tooth ? 'bg-white text-neutral-950' : placed.has(tooth) ? 'bg-white/20 text-white' : 'text-neutral-300 ring-1 ring-white/20 ring-inset hover:text-white'
              } ${i === 8 ? 'sm:border-l sm:border-white/40' : ''}`}
            >
              {tooth}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
