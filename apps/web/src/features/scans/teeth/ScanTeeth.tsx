import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Chart } from '../../dental-chart/api'
import { ToothCallout } from '../../dental-chart/components/ToothCallout'
import { type FdiCode, isFdiCode, toothName } from '../../dental-chart/model/fdi'
import { STATUS_COLORS, statusOf } from '../../dental-chart/model/status'
import { useSaveScanPins, useSaveScanViewSettings, useScanPins } from '../api'
import { scanErrorCode, scanErrorMessage } from '../errors'
import type { Scan } from '../types'
import type { Vec3 } from '../viewer/fitMath'
import { ARCH_ORDER, nearestPin, neckToView, occlusalView, REGION_TRIANGLE_LIMIT, regionsOf, teethFacing, toFile, toView, type ViewPin } from '../viewer/pinMath'
import { menuItem, MenuTick, type StageLayer } from '../viewer/ScanStage'
import { CheckTeeth } from './CheckTeeth'
import { type Arch, detectTeeth, type DetectResult } from './detector'
import { layoutLabels } from './labelLayout'
import { MarkTeeth } from './MarkTeeth'
import { ScanViewOptions } from './ScanViewOptions'

type Props = {
  patientId: string
  scan: Scan
  layer: StageLayer
  chart: Chart | undefined
  selected: FdiCode | null
  onSelect: (tooth: FdiCode | null) => void
  /** Dentists and admins, on a patient that isn't archived, on a scan that isn't withdrawn. */
  canMark: boolean
  /** Marking by hand (the fallback), which uses the white panel. */
  marking: boolean
  onMarkingChange: (on: boolean) => void
  /** Where the marking list goes in the white panel. */
  panel: HTMLElement | null
}

/** The automatic check of the teeth, step by step. */
type Check =
  | { step: 'finding' }
  | { step: 'review' | 'fix'; pins: ViewPin[]; result: DetectResult | null; focus?: FdiCode }
  | { step: 'nothing'; result: DetectResult | null }

const SCAN_GREY = '#dedede'
// How to read the detector's confidences (measured on labelled scans by its author):
/** Below this the arch itself is asked about first (the numbers flip with it). */
const ARCH_ASK = 0.75
/** At or above these (overall, and for the arch) about 99% of teeth come out right: "Looks right?". */
const SURE = 0.6
const ARCH_SURE = 0.9
/** Below this a tooth's number is marked "check"; below GUESS it is only a suggestion. */
const TOOTH_SURE = 0.7
const GUESS = 0.3
/** The view a scan opens in once its teeth are checked: in the skull, gums hidden at each tooth's gum line. */
const CHECKED_VIEW = { view: 'IN_SKULL', hideGums: true, gumMethod: 'PINS', gumLineMm: 6, colourSensitivity: 50 } as const

/** Mixes two CSS hex colours: t = 0 is a, 1 is b. */
function mix(a: string, b: string, t: number) {
  const n = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [x, y] = [n(a), n(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/**
 * The teeth the detector's notes ask to check ("Please check teeth 17 (…)", "Couldn't tell 25
 * from 24"), not the ones they say weren't found.
 */
function namedInNotes(notes: string[]): FdiCode[] {
  const out = new Set<FdiCode>()
  for (const note of notes) {
    if (!/check|couldn't tell|too close/i.test(note) || /not found/i.test(note)) continue
    // In "Please check teeth 17 (reason); 27 (reason)" only the numbers before each reason count.
    const plain = note.replace(/\([^)]*\)/g, '')
    for (const match of plain.matchAll(/\b([1-4][1-8])\b/g)) if (isFdiCode(match[1])) out.add(match[1])
  }
  return [...out]
}

/** Keeps a component re-rendering as the camera moves, so labels drawn over the canvas follow the scan. */
function useViewTick(layer: StageLayer) {
  const [tick, setTick] = useState(0)
  useEffect(() => layer.viewer.onViewChange(() => setTick((n) => (n + 1) % 1e6)), [layer.viewer])
  return tick
}

/** The detector's teeth as pins: valid numbers only, one pin per number (the surest). */
function pinsFrom(result: DetectResult): ViewPin[] {
  const best = new Map<FdiCode, { at: Vec3; neck: Vec3 | null; confidence: number }>()
  for (const t of result.teeth) {
    if (!isFdiCode(t.tooth)) continue
    const now = best.get(t.tooth)
    if (!now || t.confidence > now.confidence) best.set(t.tooth, { at: t.at, neck: t.neck ?? null, confidence: t.confidence })
  }
  return [...best].map(([tooth, { at, neck }]) => ({ tooth, at, neck }))
}

/**
 * The teeth on a scan. A scan with no teeth yet is checked automatically: the detector numbers
 * the teeth, the dentist confirms or fixes the numbers, and the scan opens in the skull. Then
 * clicking the surface (or a standard tooth around it) picks a tooth, with its highlight and
 * callout, and the chart's shading. Marking by hand is MarkTeeth, kept as a fallback.
 */
export function ScanTeeth({ patientId, scan, layer, chart, selected, onSelect, canMark, marking, onMarkingChange, panel }: Props) {
  const { viewer, mesh, more } = layer
  const pinsQuery = useScanPins(patientId, scan.id)
  const saved = useMemo<ViewPin[]>(
    () => (pinsQuery.data?.items ?? []).filter((p) => isFdiCode(p.tooth)).map((p) => ({ tooth: p.tooth as FdiCode, at: toView(p, mesh.transform), neck: neckToView(p, mesh.transform) })),
    [pinsQuery.data, mesh.transform],
  )
  const [draft, setDraft] = useState<ViewPin[] | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [axisHint, setAxisHint] = useState<{ jaw: Arch; axis: Vec3 } | null>(null)
  const [savedAxis, setSavedAxis] = useState<Vec3 | null>(null)
  const [viewKey, setViewKey] = useState(0)
  const [showNumbers, setShowNumbers] = useState(true)
  const [shade, setShade] = useState(false)
  const [panelShown, setPanelShown] = useState(false)
  const [standard, setStandard] = useState<{ tooth: FdiCode; anchor: Vec3 }[]>([])
  const savePins = useSaveScanPins(patientId, scan.id)
  const saveView = useSaveScanViewSettings(patientId, scan.id)
  const tick = useViewTick(layer)
  const tooBig = mesh.triangles > REGION_TRIANGLE_LIMIT
  const busy = marking || check !== null

  // Finding the teeth (the detector copies the scan's arrays for its worker).
  const abort = useRef<AbortController | null>(null)
  const find = useCallback(
    (arch?: Arch) => {
      const positions = viewer.positions
      if (!positions) return
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      onSelect(null)
      setCheck({ step: 'finding' })
      detectTeeth(
        { positions, index: viewer.triangleIndex, colors: viewer.colors, unitsPerMm: mesh.transform.scale, arch },
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return
          const found = pinsFrom(result)
          setAxisHint({ jaw: result.arch, axis: result.occlusal })
          setCheck(found.length > 0 ? { step: 'review', pins: found, result } : { step: 'nothing', result })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          console.error('Finding the teeth failed', error)
          setCheck({ step: 'nothing', result: null })
        })
    },
    [viewer, mesh.transform.scale, onSelect],
  )
  useEffect(() => () => abort.current?.abort(), [])

  // A scan whose teeth aren't checked yet is checked as soon as it opens (once per visit).
  const tried = useRef(false)
  useEffect(() => {
    if (tried.current || !canMark || marking || !pinsQuery.isSuccess || saved.length > 0) return
    tried.current = true
    find()
  }, [canMark, marking, pinsQuery.isSuccess, saved.length, find])

  // While checking, the scan faces its biting surfaces, front teeth at the top.
  const reviewing = check?.step === 'review' || check?.step === 'fix' ? check : null
  const reviewAxis = reviewing ? (reviewing.result && axisHint ? axisHint.axis : savedAxis) : null
  const reviewPins = useRef<ViewPin[]>([])
  const nowPins = reviewing?.pins
  useEffect(() => {
    reviewPins.current = nowPins ?? []
  })
  const reviewResult = reviewing?.result ?? null
  useEffect(() => {
    if (!reviewAxis) return
    // A little further back and lower down, so the banner across the top covers no tooth (on a
    // tall phone stage the banner is taller and there is room below, so lower still).
    const tall = viewer.canvas.clientHeight > viewer.canvas.clientWidth * 1.2
    viewer.setHome(occlusalView(reviewAxis, reviewPins.current, 4.6, tall ? 0.17 : 0.03))
    viewer.resetView()
    return () => viewer.setHome(null)
  }, [reviewAxis, reviewResult, viewer])

  const confirm = (pins: ViewPin[]) => {
    savePins.mutate(
      pins.map((p) => toFile(p, mesh.transform)),
      {
        onSuccess: () => {
          setCheck(null)
          // The scan now opens in the skull with its gums hidden, for everyone.
          saveView.mutate(CHECKED_VIEW, { onSettled: () => setViewKey((k) => k + 1) })
        },
      },
    )
  }
  const checkError = savePins.isError
    ? scanErrorCode(savePins.error) === 'SCAN_WITHDRAWN'
      ? 'This scan was withdrawn, so its teeth can’t be changed.'
      : scanErrorMessage(savePins.error)
    : null

  // A selected tooth that is neither pinned nor drawn as a standard tooth any more is let go.
  useEffect(() => {
    if (selected && !saved.some((p) => p.tooth === selected) && !standard.some((t) => t.tooth === selected)) onSelect(null)
  }, [saved, standard, selected, onSelect])

  // Which tooth each part of the surface belongs to. Worked out once per set of pins.
  const regions = useMemo(() => {
    const positions = viewer.positions
    if (tooBig || busy || saved.length === 0 || !positions) return null
    return regionsOf(positions, saved)
  }, [viewer, saved, tooBig, busy])

  const selectedPin = selected !== null && saved.some((p) => p.tooth === selected)
  useEffect(() => {
    if (!regions || (!selectedPin && !shade)) {
      viewer.setShading(null, [], SCAN_GREY)
      return
    }
    const colours = saved.map((pin) => {
      const now = chart?.teeth[pin.tooth]
      const base = shade ? STATUS_COLORS[now ? statusOf(now.condition) : 'healthy'] : SCAN_GREY
      if (!selectedPin) return base
      return pin.tooth === selected ? (shade ? base : '#ffffff') : mix(base, '#2a2a2a', shade ? 0.5 : 0.4)
    })
    const rest = selectedPin ? mix(SCAN_GREY, '#2a2a2a', 0.4) : SCAN_GREY
    viewer.setShading(regions, colours, rest)
  }, [viewer, regions, saved, selected, selectedPin, shade, chart])
  useEffect(() => () => viewer.setShading(null, [], SCAN_GREY), [viewer])

  // A click (not a drag) picks the nearest thing under it: a standard tooth around the scan, or
  // the scanned tooth whose pin is nearest the point on the surface.
  const latest = useRef({ saved, standard })
  useEffect(() => {
    latest.current = { saved, standard }
  }, [saved, standard])
  useEffect(() => {
    if (busy) return
    const canvas = viewer.canvas
    const down: { at: { x: number; y: number; t: number } | null } = { at: null }
    const onDown = (e: PointerEvent) => {
      down.at = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null
    }
    const onUp = (e: PointerEvent) => {
      const start = down.at
      down.at = null
      if (!start || e.button !== 0 || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6 || performance.now() - start.t > 600) return
      const { saved: pins, standard: others } = latest.current
      if (pins.length === 0) return
      const hit = viewer.pickAll(e.clientX, e.clientY)
      const other = hit.tooth && hit.toothDistance < hit.scanDistance ? others.find((t) => t.tooth === hit.tooth) : undefined
      if (other) return onSelect(other.tooth)
      const pin = hit.scan ? nearestPin(hit.scan, pins) : null
      onSelect(pin ? pin.tooth : null)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
    }
  }, [viewer, busy, onSelect])

  const startFix = useCallback(() => {
    onSelect(null)
    setCheck({ step: 'fix', pins: saved, result: null })
  }, [onSelect, saved])
  const startMarking = useCallback(() => {
    abort.current?.abort()
    setCheck(null)
    onSelect(null)
    onMarkingChange(true)
  }, [onSelect, onMarkingChange])

  const stage = { width: viewer.canvas.clientWidth, height: viewer.canvas.clientHeight }
  // tick is read so the positions below are worked out again as the camera moves.
  void tick
  const anchorAt = selected ? (saved.find((p) => p.tooth === selected)?.at ?? standard.find((t) => t.tooth === selected)?.anchor) : undefined
  const anchor = anchorAt ? viewer.project(anchorAt) : null
  const callout = !busy && selected && anchor && stage.width >= 560
  const archOrder = [...ARCH_ORDER.upper, ...ARCH_ORDER.lower]
  // Numbers only on the teeth turned toward the camera: from the side, the far side's teeth are
  // behind the near side's and their numbers would only crowd it.
  const facing = savedAxis ? teethFacing(saved, savedAxis, viewer.getCamera().position) : null
  const labels = layoutLabels(
    [...saved]
      .sort((a, b) => archOrder.indexOf(a.tooth) - archOrder.indexOf(b.tooth))
      .filter((pin) => (pin.tooth === selected ? !callout : showNumbers && (!facing || facing.has(pin.tooth))))
      .map((pin) => ({ pin, at: viewer.project(pin.at) }))
      .filter(({ at }) => at && at.x >= 0 && at.y >= 0 && at.x <= stage.width && at.y <= stage.height)
      .map(({ pin, at }) => ({ key: pin.tooth, x: at!.x, y: at!.y })),
    10,
  )

  const options = pinsQuery.isSuccess && (
    <ScanViewOptions
      key={viewKey}
      patientId={patientId}
      scan={scan}
      layer={layer}
      pins={saved}
      busy={busy}
      canSave={canMark}
      chart={chart}
      axisHint={axisHint}
      selected={selected}
      onStandardTeeth={setStandard}
      onAxis={setSavedAxis}
      onFix={canMark ? startFix : undefined}
      onPanel={setPanelShown}
    />
  )

  if (marking && pinsQuery.isSuccess) {
    return (
      <>
        {options}
        <MarkTeeth
          patientId={patientId}
          scan={scan}
          layer={layer}
          pins={draft ?? saved}
          onPins={setDraft}
          panel={panel}
          onDone={() => {
            setDraft(null)
            onMarkingChange(false)
          }}
        />
      </>
    )
  }

  const detected = check && 'result' in check && check.result ? check.result.teeth.filter((t) => isFdiCode(t.tooth)) : []
  // Teeth to check: those the detector wasn't sure of, and those its notes name as doubtful.
  const named = namedInNotes(check && 'result' in check && check.result ? check.result.notes : [])
  const unsure = new Set([...detected.filter((t) => t.confidence < TOOTH_SURE).map((t) => t.tooth as FdiCode), ...named])
  const guesses = new Set(detected.filter((t) => t.confidence < GUESS).map((t) => t.tooth as FdiCode))
  const tooth = selected

  return (
    <>
      {options}

      {check?.step === 'finding' && (
        <p role="status" className="pointer-events-none absolute top-3 left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-md border border-white/20 bg-neutral-950/85 px-3.5 py-2 text-sm text-white">
          Finding the teeth…
        </p>
      )}

      {(check?.step === 'review' || check?.step === 'fix') && (
        <CheckTeeth
          // A fresh start for each step: nothing chosen, no undo history.
          key={check.step}
          layer={layer}
          step={check.step}
          pins={check.pins}
          onPins={(pins) => setCheck({ ...check, pins })}
          found={
            check.result
              ? {
                  arch: check.result.arch,
                  archUnsure: check.result.archConfidence < ARCH_ASK,
                  sure: check.result.confidence >= SURE && check.result.archConfidence >= ARCH_SURE,
                  notes: check.result.notes,
                }
              : null
          }
          unsure={unsure}
          guesses={guesses}
          saving={savePins.isPending}
          error={checkError}
          onConfirm={() => confirm(check.pins)}
          onFix={(tooth) => setCheck({ ...check, step: 'fix', focus: tooth })}
          focus={check.focus ?? null}
          onCancelFix={() => (check.result ? setCheck({ ...check, step: 'review', pins: pinsFrom(check.result) }) : setCheck(null))}
          onArch={(arch) => find(arch)}
          onLater={() => setCheck(null)}
          laterLabel={saved.length === 0 ? 'Later' : 'Cancel'}
        />
      )}

      {check?.step === 'nothing' && (
        <div role="status" className="absolute inset-x-2 top-2 z-20 rounded-md border border-white/20 bg-neutral-950/95 p-2.5 text-white sm:inset-x-auto sm:top-3 sm:left-1/2 sm:w-[min(36rem,calc(100%-1.5rem))] sm:-translate-x-1/2 sm:p-3">
          <p className="text-base font-semibold">No teeth found on this scan.</p>
          {check.result?.notes.slice(0, 2).map((note) => (
            <p key={note} className="mt-0.5 text-sm text-neutral-400">
              {note}
            </p>
          ))}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={startMarking} className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-neutral-950 outline-white hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11">
              Mark teeth by hand
            </button>
            <button type="button" onClick={() => setCheck(null)} className="inline-flex h-9 items-center justify-center rounded-md border border-white/25 px-3 text-sm font-medium text-neutral-200 outline-white hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11">
              Later
            </button>
          </div>
        </div>
      )}

      {/* The pins, as small numbered labels on the surface; crowded ones move out on a leader line. */}
      {!busy && (
        <>
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {labels
              .filter((d) => d.moved)
              .map((d) => (
                <g key={d.key}>
                  <line x1={d.ax} y1={d.ay} x2={d.x} y2={d.y} stroke="white" strokeOpacity={0.55} strokeWidth={1} />
                  <circle cx={d.ax} cy={d.ay} r={2} fill="white" fillOpacity={0.8} />
                </g>
              ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {labels.map((d) => {
              const on = d.key === selected
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => onSelect(on ? null : (d.key as FdiCode))}
                  aria-label={`Tooth ${d.key}, ${toothName(d.key as FdiCode)}`}
                  aria-pressed={on}
                  className="pointer-events-auto absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-white focus-visible:outline-2 pointer-coarse:size-11"
                  style={{ left: d.x, top: d.y }}
                >
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
                      on ? 'bg-white text-neutral-950' : 'bg-neutral-950/70 text-white ring-1 ring-white/40'
                    }`}
                  >
                    {d.key}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {callout && tooth && anchor && (
        <ToothCallout
          tooth={tooth}
          anchor={anchor}
          stage={stage}
          now={chart?.teeth[tooth]}
          latest={chart?.records.find((record) => record.id === chart.teeth[tooth]?.recordId)}
        />
      )}

      {!busy && saved.length === 0 && pinsQuery.isSuccess && !panelShown && (
        <p className="pointer-events-none absolute top-3 left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded bg-white/10 px-3 py-1.5 text-center text-sm text-neutral-200">
          Teeth not checked yet
        </p>
      )}

      {more &&
        !busy &&
        createPortal(
          <>
            {saved.length > 0 && (
              <>
                <button type="button" data-keep-open aria-pressed={showNumbers} onClick={() => setShowNumbers((on) => !on)} className={`${menuItem} order-1`}>
                  <MenuTick on={showNumbers} /> Tooth numbers
                </button>
                {!tooBig && (
                  <button type="button" data-keep-open aria-pressed={shade} onClick={() => setShade((on) => !on)} className={`${menuItem} order-1`}>
                    <MenuTick on={shade} /> Shade by condition
                  </button>
                )}
              </>
            )}
            {canMark && (
              <>
                {saved.length > 0 && (
                  <button type="button" onClick={startFix} className={`${menuItem} order-3`}>
                    <MenuTick on={false} /> Fix numbers
                  </button>
                )}
                <button type="button" onClick={() => find()} className={`${menuItem} order-3`}>
                  <MenuTick on={false} /> {saved.length > 0 ? 'Find the teeth again' : 'Find the teeth'}
                </button>
                <button type="button" onClick={startMarking} className={`${menuItem} order-3`}>
                  <MenuTick on={false} /> Mark teeth by hand
                </button>
              </>
            )}
          </>,
          more,
        )}
      {tooBig && saved.length > 0 && !busy && (
        <p className="pointer-events-none absolute top-14 right-3 max-w-xs rounded bg-white/10 px-2.5 py-1.5 text-right text-xs/5 text-neutral-200">
          Tooth shading is off for a scan this large. Clicking still picks the nearest tooth.
        </p>
      )}
    </>
  )
}
