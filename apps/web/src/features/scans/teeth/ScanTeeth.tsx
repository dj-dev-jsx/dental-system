import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Chart } from '../../dental-chart/api'
import { ToothCallout } from '../../dental-chart/components/ToothCallout'
import { type FdiCode, isFdiCode, toothName } from '../../dental-chart/model/fdi'
import { STATUS_COLORS, statusOf } from '../../dental-chart/model/status'
import { useScanPins } from '../api'
import type { Scan } from '../types'
import { nearestPin, REGION_TRIANGLE_LIMIT, regionsOf, toView, type ViewPin } from '../viewer/pinMath'
import type { StageLayer } from '../viewer/ScanStage'
import { MarkTeeth } from './MarkTeeth'

type Props = {
  patientId: string
  scan: Scan
  layer: StageLayer
  chart: Chart | undefined
  selected: FdiCode | null
  onSelect: (tooth: FdiCode | null) => void
  /** Dentists and admins, on a patient that isn't archived, on a scan that isn't withdrawn. */
  canMark: boolean
  marking: boolean
  onMarkingChange: (on: boolean) => void
  /** Where the marking list goes in the white panel. */
  panel: HTMLElement | null
}

const toolButton =
  'inline-flex h-8 items-center gap-1.5 rounded border border-white/20 bg-neutral-950/70 px-2.5 text-sm font-medium outline-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11'

const SCAN_GREY = '#dedede'

/** Mixes two CSS hex colours: t = 0 is a, 1 is b. */
function mix(a: string, b: string, t: number) {
  const n = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [x, y] = [n(a), n(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** Keeps a component re-rendering as the camera moves, so labels drawn over the canvas follow the scan. */
function useViewTick(layer: StageLayer) {
  const [tick, setTick] = useState(0)
  useEffect(() => layer.viewer.onViewChange(() => setTick((n) => (n + 1) % 1e6)), [layer.viewer])
  return tick
}

/**
 * The teeth on a scan: the pins a dentist placed, clicking the surface to pick the nearest
 * tooth, its highlight and callout, and shading by the chart. Marking itself is MarkTeeth.
 */
export function ScanTeeth({ patientId, scan, layer, chart, selected, onSelect, canMark, marking, onMarkingChange, panel }: Props) {
  const { viewer, mesh, tools } = layer
  const pinsQuery = useScanPins(patientId, scan.id)
  const saved = useMemo<ViewPin[]>(
    () => (pinsQuery.data?.items ?? []).filter((p) => isFdiCode(p.tooth)).map((p) => ({ tooth: p.tooth as FdiCode, at: toView(p, mesh.transform) })),
    [pinsQuery.data, mesh.transform],
  )
  const [draft, setDraft] = useState<ViewPin[] | null>(null)
  const [showNumbers, setShowNumbers] = useState(true)
  const [shade, setShade] = useState(false)
  const tick = useViewTick(layer)
  const tooBig = mesh.triangles > REGION_TRIANGLE_LIMIT

  // Leaving marking mode, or a selected tooth that has no pin any more, clears the selection.
  useEffect(() => {
    if (selected && !saved.some((p) => p.tooth === selected)) onSelect(null)
  }, [saved, selected, onSelect])

  // Which tooth each part of the surface belongs to. Worked out once per set of pins.
  const regions = useMemo(() => {
    const positions = viewer.positions
    if (tooBig || marking || saved.length === 0 || !positions) return null
    return regionsOf(positions, saved)
  }, [viewer, saved, tooBig, marking])

  useEffect(() => {
    if (!regions || (!selected && !shade)) {
      viewer.setShading(null, [], SCAN_GREY)
      return
    }
    const colours = saved.map((pin) => {
      const now = chart?.teeth[pin.tooth]
      const base = shade ? STATUS_COLORS[now ? statusOf(now.condition) : 'healthy'] : SCAN_GREY
      if (!selected) return base
      return pin.tooth === selected ? (shade ? base : '#ffffff') : mix(base, '#2a2a2a', shade ? 0.5 : 0.4)
    })
    const rest = selected ? mix(SCAN_GREY, '#2a2a2a', 0.4) : SCAN_GREY
    viewer.setShading(regions, colours, rest)
  }, [viewer, regions, saved, selected, shade, chart])
  useEffect(() => () => viewer.setShading(null, [], SCAN_GREY), [viewer])

  // A click (not a drag) on the surface picks the tooth whose pin is nearest.
  const pinsRef = useRef(saved)
  useEffect(() => {
    pinsRef.current = saved
  }, [saved])
  useEffect(() => {
    if (marking) return
    const canvas = viewer.canvas
    const down: { at: { x: number; y: number; t: number } | null } = { at: null }
    const onDown = (e: PointerEvent) => {
      down.at = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null
    }
    const onUp = (e: PointerEvent) => {
      const start = down.at
      down.at = null
      if (!start || e.button !== 0 || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6 || performance.now() - start.t > 600) return
      if (pinsRef.current.length === 0) return
      const hit = viewer.pick(e.clientX, e.clientY)
      const pin = hit ? nearestPin(hit, pinsRef.current) : null
      onSelect(pin ? pin.tooth : null)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
    }
  }, [viewer, marking, onSelect])

  const startMarking = useCallback(() => {
    onSelect(null)
    onMarkingChange(true)
  }, [onSelect, onMarkingChange])

  const stage = { width: viewer.canvas.clientWidth, height: viewer.canvas.clientHeight }
  const anchorPin = selected ? saved.find((p) => p.tooth === selected) : undefined
  // tick is read so the positions below are worked out again as the camera moves.
  void tick
  const anchor = anchorPin ? viewer.project(anchorPin.at) : null
  const callout = !marking && selected && anchor && stage.width >= 560

  if (marking && pinsQuery.isSuccess) {
    return (
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
    )
  }

  const tooth = selected
  return (
    <>
      {/* The pins, as small numbered labels on the surface. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {saved.map((pin) => {
          if (pin.tooth === selected ? callout : !showNumbers) return null
          const at = viewer.project(pin.at)
          if (!at || at.x < 0 || at.y < 0 || at.x > stage.width || at.y > stage.height) return null
          const on = pin.tooth === selected
          return (
            <button
              key={pin.tooth}
              type="button"
              onClick={() => onSelect(on ? null : pin.tooth)}
              aria-label={`Tooth ${pin.tooth}, ${toothName(pin.tooth)}`}
              aria-pressed={on}
              className="pointer-events-auto absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-white focus-visible:outline-2 pointer-coarse:size-11"
              style={{ left: at.x, top: at.y }}
            >
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
                  on ? 'bg-white text-neutral-950' : 'bg-neutral-950/60 text-white ring-1 ring-white/40'
                }`}
              >
                {pin.tooth}
              </span>
            </button>
          )
        })}
      </div>

      {callout && tooth && anchor && (
        <ToothCallout
          tooth={tooth}
          anchor={anchor}
          stage={stage}
          now={chart?.teeth[tooth]}
          latest={chart?.records.find((record) => record.id === chart.teeth[tooth]?.recordId)}
        />
      )}

      {saved.length === 0 && pinsQuery.isSuccess && (
        <p className="pointer-events-none absolute top-3 left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded bg-white/10 px-3 py-1.5 text-center text-sm text-neutral-200">
          {canMark ? 'Mark the teeth once to click a tooth and see its chart.' : 'Teeth not marked yet on this scan.'}
        </p>
      )}

      {tools &&
        createPortal(
          <>
            {canMark && (
              <button type="button" onClick={startMarking} className={`${toolButton} text-neutral-300 hover:text-white`}>
                {saved.length > 0 ? 'Edit teeth' : 'Mark teeth'}
              </button>
            )}
            {saved.length > 0 && (
              <>
                <button
                  type="button"
                  aria-pressed={showNumbers}
                  onClick={() => setShowNumbers((on) => !on)}
                  className={`${toolButton} ${showNumbers ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:text-white'}`}
                >
                  Tooth numbers
                </button>
                {!tooBig && (
                  <button
                    type="button"
                    aria-pressed={shade}
                    onClick={() => setShade((on) => !on)}
                    className={`${toolButton} ${shade ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:text-white'}`}
                  >
                    Shade by condition
                  </button>
                )}
              </>
            )}
          </>,
          tools,
        )}
      {tooBig && saved.length > 0 && (
        <p className="pointer-events-none absolute top-14 right-3 max-w-xs rounded bg-white/10 px-2.5 py-1.5 text-right text-xs/5 text-neutral-200">
          Tooth shading is off for a scan this large. Clicking still picks the nearest tooth.
        </p>
      )}
    </>
  )
}
