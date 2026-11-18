import { useEffect, useRef, useState } from 'react'
import { buttonOnDark } from '../../../components/buttons'
import { type FdiCode, toothName } from '../../dental-chart/model/fdi'
import { useLeaveGuard } from '../../clinic/useLeaveGuard'
import { ARCH_ORDER, type Vec3, type ViewPin } from '../viewer/pinMath'
import type { StageLayer } from '../viewer/ScanStage'
import type { Arch } from './detector'
import { layoutLabels } from './labelLayout'
import { TeethPicker } from './MarkTeeth'
import { type Change, describe, type Fix, likelyNumbers, merge, missingHere, notATooth, renumber, shiftSide, twinOf } from './renumber'

type Props = {
  layer: StageLayer
  step: 'review' | 'fix'
  pins: ViewPin[]
  onPins: (pins: ViewPin[]) => void
  /** What the detector found, for the review line. */
  found: { arch: Arch; archUnsure: boolean; sure: boolean; notes: string[] } | null
  /** Teeth the detector wasn't sure of (check them), and those it only suggests (a guess). */
  unsure: ReadonlySet<FdiCode>
  guesses: ReadonlySet<FdiCode>
  saving: boolean
  error: string | null
  onConfirm: () => void
  /** Opens fixing, with a tooth already chosen when one was tapped. */
  onFix: (tooth?: FdiCode) => void
  /** The tooth chosen when fixing opens. */
  focus?: FdiCode | null
  /** Leaves "Fix numbers" without saving. */
  onCancelFix: () => void
  /** Runs the detector again on the other arch. */
  onArch?: (arch: Arch) => void
  onLater?: () => void
  laterLabel?: string
}

const barButton =
  'inline-flex h-9 items-center justify-center rounded-md border border-white/25 px-3 text-sm font-medium text-neutral-200 outline-white transition-colors duration-150 hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-600 pointer-coarse:h-11'
const primary = `${buttonOnDark} h-9 px-4 text-sm pointer-coarse:h-11`

const listOf = (teeth: FdiCode[]) => (teeth.length <= 1 ? teeth.join('') : `${teeth.slice(0, -1).join(', ')} and ${teeth.at(-1)}`)

/**
 * Checking the teeth the detector found: one banner over the stage ("Found 14 teeth on the upper
 * arch. Check the numbers.") with Looks right and Fix numbers. Fixing: drag a number to move it,
 * tap it to change it or remove it, add a missing tooth, then Done (which saves, like Looks right).
 */
export function CheckTeeth({ layer, step, pins, onPins, found, unsure, guesses, saving, error, onConfirm, onFix, onCancelFix, onArch, onLater, laterLabel = 'Later', focus = null }: Props) {
  const { viewer } = layer
  const [, setTick] = useState(0)
  const [active, setActiveRaw] = useState<FdiCode | null>(focus)
  const [picking, setPicking] = useState(false)
  const setActive: typeof setActiveRaw = (value) => {
    setPicking(false)
    setPreview(null)
    setActiveRaw(value)
  }
  const [adding, setAdding] = useState<'pick' | FdiCode | null>(null)
  const [history, setHistory] = useState<ViewPin[][]>([])
  const [initial] = useState(pins)
  const fixing = step === 'fix'
  const guard = useLeaveGuard(fixing && pins !== initial)
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const verb = coarse ? 'Tap' : 'Click'

  useEffect(() => viewer.onViewChange(() => setTick((n) => (n + 1) % 1e6)), [viewer])

  const [last, setLast] = useState<string | null>(null)
  const [preview, setPreview] = useState<Fix | null>(null)
  const commit = (next: ViewPin[]) => {
    setHistory((h) => [...h.slice(-99), pins])
    onPins(next)
  }
  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory((h) => h.slice(0, -1))
    onPins(previous)
    setActive(null)
    setPreview(null)
    setLast(null)
  }
  /** Applies one of the fixes, says what changed, and goes back to the whole arch. */
  const apply = (fix: Fix | null) => {
    if (!fix) return
    if (fix.changes.length > 0) commit(fix.pins)
    setLast(fix.changes.length > 0 ? describe(fix.changes) : null)
    setActive(null)
    setPreview(null)
  }

  // Adding a tooth: after its number is chosen, a click on the surface places it.
  const placing = typeof adding === 'string' && adding !== 'pick' ? adding : null
  const latest = useRef({ placing, pins, commit })
  useEffect(() => {
    latest.current = { placing, pins, commit }
  })
  useEffect(() => {
    if (!placing) return
    const canvas = viewer.canvas
    const down: { at: { x: number; y: number; t: number } | null } = { at: null }
    const onDown = (e: PointerEvent) => {
      down.at = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null
    }
    const onUp = (e: PointerEvent) => {
      const start = down.at
      down.at = null
      if (!start || e.button !== 0 || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6 || performance.now() - start.t > 600) return
      const hit = viewer.pick(e.clientX, e.clientY)
      const { placing: tooth, pins: now, commit: put } = latest.current
      if (!hit || !tooth) return
      put([...now.filter((p) => p.tooth !== tooth), { tooth, at: hit }])
      setAdding(null)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    viewer.setCursor('crosshair')
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      viewer.setCursor('')
    }
  }, [placing, viewer])

  // Esc steps back: out of a choice, then out of fixing.
  useEffect(() => {
    if (!fixing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (active || adding) {
        setActive(null)
        setAdding(null)
      } else onCancelFix()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fixing, active, adding, onCancelFix])

  // Dragging a number moves its pin over the surface; the camera stays still meanwhile.
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
    if (!d || d.id !== e.pointerId || !fixing) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
    d.moved = true
    const { clientX, clientY } = e
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const hit: Vec3 | null = viewer.pick(clientX, clientY)
      if (hit && drag.current) onPins([...drag.current.start.filter((p) => p.tooth !== d.tooth), { tooth: d.tooth, at: hit }])
    })
  }
  const onPinUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    viewer.setControlsEnabled(true)
    if (d.moved) {
      setHistory((h) => [...h.slice(-99), d.start])
      return
    }
    // A tap: in the review it opens fixing with this tooth chosen.
    if (!fixing) return onFix(d.tooth)
    setAdding(null)
    setActive((now) => (now === d.tooth ? null : d.tooth))
  }
  useEffect(() => () => viewer.setControlsEnabled(true), [viewer])

  const stage = { width: viewer.canvas.clientWidth, height: viewer.canvas.clientHeight }
  const placed = new Set(pins.map((p) => p.tooth))
  const unsureHere = pins.map((p) => p.tooth).filter((t) => unsure.has(t))
  const archWord = found?.arch === 'lower' ? 'lower' : 'upper'

  // While an option is pointed at, the discs show what it would do.
  const shown = preview?.pins ?? pins
  const changed = new Set(preview?.changes.filter((c) => c.to).map((c) => c.to as FdiCode) ?? [])
  const order = [...ARCH_ORDER.upper, ...ARCH_ORDER.lower]
  const onScreen = [...shown]
    .sort((a, b) => order.indexOf(a.tooth) - order.indexOf(b.tooth))
    .map((pin) => ({ pin, at: viewer.project(pin.at) }))
    .filter((p): p is { pin: ViewPin; at: { x: number; y: number } } => Boolean(p.at && p.at.x >= 0 && p.at.y >= 0 && p.at.x <= stage.width && p.at.y <= stage.height))
  const discs = layoutLabels(
    onScreen.map(({ pin, at }) => ({ key: pin.tooth, x: at.x, y: at.y })),
    coarse ? 16 : 14,
  )
  const pinOf = new Map(onScreen.map(({ pin }) => [pin.tooth, pin]))

  // The likely fixes for the chosen tooth, each worked out ahead so its effect can be shown.
  const options = active
    ? likelyNumbers(active).map((to) => ({ to, fix: renumber(pins, active, to) }))
    : []
  const twin = active ? twinOf(pins, active) : null

  const archSwitch =
    found && onArch ? (
                <div className="flex rounded-md border border-white/20 p-0.5" role="group" aria-label="Arch">
                  {(['upper', 'lower'] as const).map((arch) => (
                    <button
                      key={arch}
                      type="button"
                      aria-pressed={found.arch === arch}
                      onClick={() => found.arch !== arch && onArch(arch)}
                      className={`h-8 rounded px-2.5 text-sm font-medium outline-white focus-visible:outline-2 pointer-coarse:h-11 ${found.arch === arch ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:text-white'}`}
                    >
                      {arch === 'upper' ? 'Upper' : 'Lower'}
                    </button>
                  ))}
                </div>
    ) : null

  return (
    <>
      {/* Leader lines from discs moved off crowded teeth back to their teeth. */}
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {discs
          .filter((d) => d.moved)
          .map((d) => (
            <g key={d.key}>
              <line x1={d.ax} y1={d.ay} x2={d.x} y2={d.y} stroke="white" strokeOpacity={0.7} strokeWidth={1.25} />
              <circle cx={d.ax} cy={d.ay} r={2.5} fill="white" />
            </g>
          ))}
      </svg>
      {/* The numbers on the teeth: white, or outlined where the detector wasn't sure. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {discs.map((d) => {
          const pin = pinOf.get(d.key as FdiCode)
          if (!pin) return null
          const on = active === pin.tooth
          const doubt = unsure.has(pin.tooth)
          const guess = guesses.has(pin.tooth)
          const will = changed.has(pin.tooth)
          return (
            <button
              key={pin.tooth}
              type="button"
              aria-label={`Tooth ${pin.tooth}${guess ? ', a guess' : doubt ? ', not sure' : ''}. ${fixing ? 'Drag to move, or press to change' : 'Press to fix'}`}
              aria-pressed={fixing ? on : undefined}
              onPointerDown={onPinDown(pin.tooth)}
              onPointerMove={onPinMove}
              onPointerUp={onPinUp}
              onPointerCancel={onPinUp}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (!fixing) return onFix(pin.tooth)
                  setActive((now) => (now === pin.tooth ? null : pin.tooth))
                }
                if (fixing && (e.key === 'Delete' || e.key === 'Backspace')) apply(notATooth(pins, pin.tooth))
              }}
              className={`pointer-events-auto absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-white select-none focus-visible:outline-2 ${fixing ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer'}`}
              style={{ left: d.x, top: d.y }}
            >
              <span
                className={`grid size-7 place-items-center rounded-full text-xs font-bold tabular-nums shadow-[0_1px_3px_rgb(0_0_0/0.6)] pointer-coarse:size-8 ${
                  on
                    ? 'bg-neutral-950 text-white ring-2 ring-white'
                    : will
                      ? 'bg-neutral-950 text-white ring-2 ring-white ring-offset-2 ring-offset-neutral-950'
                      : guess
                        ? 'border-2 border-dashed border-white/70 bg-transparent text-white/80 shadow-none'
                        : doubt
                          ? 'border-2 border-dashed border-white bg-neutral-950/80 text-white'
                          : 'bg-white text-neutral-950'
                }`}
              >
                {pin.tooth}
              </span>
            </button>
          )
        })}
      </div>

      <div className="absolute inset-x-2 top-2 z-20 rounded-md border border-white/20 bg-neutral-950 p-2.5 text-white sm:inset-x-auto sm:bg-neutral-950/95 sm:top-3 sm:left-1/2 sm:w-[min(40rem,calc(100%-1.5rem))] sm:-translate-x-1/2 sm:p-3">
        {!fixing ? (
          <>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1" role="status" aria-live="polite">
                <p className="text-base font-semibold">
                  {found?.archUnsure
                    ? `Found ${pins.length} ${pins.length === 1 ? 'tooth' : 'teeth'}. Is this the upper or lower arch?`
                    : `Found ${pins.length} ${pins.length === 1 ? 'tooth' : 'teeth'} on the ${archWord} arch. ${found?.sure ? 'Looks right?' : 'Please check these teeth.'}`}
                </p>
                {unsureHere.length > 0 && found && !found.archUnsure && <p className="mt-0.5 text-sm text-neutral-300">Check {listOf(unsureHere)}: not sure of {unsureHere.length === 1 ? 'that one' : 'those'}.</p>}
                {!found?.sure && found?.notes.slice(0, 3).map((note) => (
                  <p key={note} className="mt-0.5 text-sm text-neutral-400">
                    {note}
                  </p>
                ))}
              </div>
              {archSwitch}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={onConfirm} disabled={saving || pins.length === 0} className={primary}>
                {saving ? 'Saving…' : 'Looks right'}
              </button>
              <button type="button" onClick={() => onFix()} className={barButton}>
                Fix numbers
              </button>
              {onLater && (
                <button type="button" onClick={onLater} className="ml-auto inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-neutral-400 outline-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11">
                  {laterLabel}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1" role="status" aria-live="polite">
                <p className="text-base font-semibold">
                  {placing ? `${verb} the middle of tooth ${placing}` : active ? `Tooth ${active} is really…` : adding === 'pick' ? 'Which tooth is missing a number?' : 'Fix the numbers'}
                </p>
                <p className="mt-0.5 text-sm text-neutral-400">
                  {placing
                    ? toothName(placing)
                    : active
                      ? 'The teeth beyond it on that side follow.'
                      : adding === 'pick'
                        ? 'Pick its number, then tap where it is.'
                        : last
                          ? `${last}.`
                          : `${verb} a number to change it, or drag it to move it.`}
                </p>
              </div>
              {!active && !adding && archSwitch}
            </div>
            {active && (
              <>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label={`Tooth ${active} is really`}>
                  {options.map(({ to, fix }) => (
                    <button
                      key={to}
                      type="button"
                      disabled={!fix}
                      autoFocus={to === options[0]?.to}
                      onClick={() => apply(fix)}
                      onPointerEnter={() => setPreview(fix)}
                      onPointerLeave={() => setPreview(null)}
                      onFocus={(e) => e.currentTarget.matches(':focus-visible') && setPreview(fix)}
                      onBlur={() => setPreview(null)}
                      className="flex min-h-11 flex-col items-start justify-center rounded-md border border-white/25 px-2.5 py-1.5 text-left outline-white hover:border-white focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="text-base font-bold tabular-nums">{to}</span>
                      <span className="line-clamp-2 text-[11px]/4 text-neutral-400">{fix ? alsoText(fix.changes, active) ?? toothName(to) : 'No room'}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[
                    // A tooth counted twice is the likeliest mistake when two numbers sit this close: first.
                    ...(twin ? [{ label: `One tooth with ${twin}`, fix: merge(pins, active, twin), hint: `${active} and ${twin} are one tooth, ${active}` }] : []),
                    { label: 'Not a tooth', fix: notATooth(pins, active) },
                    { label: 'Missing here', fix: missingHere(pins, active), hint: `${active} is missing; this is the next one` },
                    { label: 'This side −1', fix: shiftSide(pins, active, -1), hint: `Every number on this side one lower` },
                    { label: 'This side +1', fix: shiftSide(pins, active, 1), hint: `Every number on this side one higher` },
                  ].map(({ label, fix, hint }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!fix}
                      title={hint}
                      onClick={() => apply(fix)}
                      onPointerEnter={() => setPreview(fix)}
                      onPointerLeave={() => setPreview(null)}
                      onFocus={(e) => e.currentTarget.matches(':focus-visible') && setPreview(fix)}
                      onBlur={() => setPreview(null)}
                      className={barButton}
                    >
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setPicking(true)} className={barButton}>
                    Other…
                  </button>
                  <button type="button" onClick={() => setActive(null)} className={`${barButton} ml-auto border-transparent text-neutral-400`}>
                    Back
                  </button>
                </div>
                {picking && (
                  <TeethPicker
                    placed={placed}
                    current={active}
                    onPick={(tooth) => {
                      setPicking(false)
                      apply(renumber(pins, active, tooth))
                    }}
                    label={`Change tooth ${active} to`}
                  />
                )}
              </>
            )}
            {adding === 'pick' && (
              <>
                <TeethPicker placed={placed} current={null} onPick={(tooth) => setAdding(tooth)} label="Choose the tooth to add" />
                <div className="mt-2.5">
                  <button type="button" onClick={() => setAdding(null)} className={barButton}>
                    Back
                  </button>
                </div>
              </>
            )}
            {placing && (
              <div className="mt-2.5">
                <button type="button" onClick={() => setAdding(null)} className={barButton}>
                  Back
                </button>
              </div>
            )}
            {!active && !adding && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setAdding('pick')} className={barButton}>
                  Add tooth
                </button>
                <button type="button" onClick={undo} disabled={history.length === 0} className={`${barButton} ${last ? 'border-white text-white' : ''}`}>
                  Undo
                </button>
                <span className="ml-auto flex gap-2">
                  <button type="button" onClick={onCancelFix} className={barButton}>
                    Cancel
                  </button>
                  <button type="button" onClick={onConfirm} disabled={saving || pins.length === 0} className={primary}>
                    {saving ? 'Saving…' : 'Done'}
                  </button>
                </span>
              </div>
            )}
          </>
        )}
        {guard.leaveTo && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm" role="alert">
            <span className="mr-auto font-semibold">Leave without saving the numbers?</span>
            <button type="button" autoFocus onClick={guard.leave} className={barButton}>
              Leave
            </button>
            <button type="button" onClick={guard.stay} className={barButton}>
              Stay
            </button>
          </div>
        )}
        {error && (
          <p className="mt-2.5 rounded bg-white px-3 py-2 text-sm font-medium text-neutral-950" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  )
}

/** What else a fix changes besides the chosen tooth: "also 25 → 24", or "and the 4 teeth beyond". Null when nothing else. */
function alsoText(changes: Change[], active: FdiCode) {
  const others = changes.filter((c) => c.from !== active)
  if (others.length === 0) return null
  return others.length <= 2 ? `also ${describe(others)}` : `and the ${others.length} teeth beyond`
}

