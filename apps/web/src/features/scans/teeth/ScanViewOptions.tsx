import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Vector3 } from 'three'
import { CloseIcon } from '../../../components/icons'
import type { Chart } from '../../dental-chart/api'
import { type FdiCode } from '../../dental-chart/model/fdi'
import { useSaveScanViewSettings, useScanViewSettings } from '../api'
import { scanErrorMessage } from '../errors'
import type { Scan, ScanViewSettings, ScanViewSettingsInput } from '../types'
import { type Jaw, jawOfTooth, jawsOf, keptTriangles, meanPoint, pinPlaneNormal, rednessLimit, surfaceOcclusal, type Vec3 } from '../viewer/fitMath'
import type { GumRequest, GumResponse } from '../viewer/gumWorker'
import { ARCH_ORDER, occlusalView, reachOf, toFile, type ViewPin } from '../viewer/pinMath'
import { MIN_PINS, type Placement, PINS_FOR_GOOD_FIT, placeScan, toothFrames } from '../viewer/placement'
import { menuItem, MenuTick, type StageLayer } from '../viewer/ScanStage'
import { bentBitePoints, buildSkullScene, chartToView, coveredBy, GUM_COLLAR, jawOpenFor, occupiedShare, pointsPerMm2, type SkullScene, standardCrownPoints } from '../viewer/skullScene'

type Props = {
  patientId: string
  scan: Scan
  layer: StageLayer
  /** The saved tooth pins, in viewer coordinates. */
  pins: ViewPin[]
  /** While the teeth are being checked or fixed: the scan alone, with its gums. */
  busy: boolean
  /** Dentists and admins, on a patient that isn't archived, on a scan that isn't withdrawn. */
  canSave: boolean
  chart: Chart | undefined
  /** The detector's gum-to-biting direction for one jaw, in viewer coordinates, when it ran this visit. */
  axisHint: { jaw: Jaw; axis: Vec3 } | null
  selected: FdiCode | null
  /** Told which standard teeth are drawn around the scan and where (viewer coordinates). */
  onStandardTeeth: (teeth: { tooth: FdiCode; anchor: Vec3 }[]) => void
  /** Told the scanned jaw's gum-to-biting direction (viewer coordinates), for facing the biting surfaces. */
  onAxis?: (axis: Vec3 | null) => void
  /** Opens "Fix numbers", from the rough-fit note. */
  onFix?: () => void
  /** Told whether the panel in the corner is showing, so other notes can make room. */
  onPanel: (shown: boolean) => void
}

type View = ScanViewSettingsInput['view']
type Settings = { view: View; hideGums: boolean; gumMethod: 'COLOUR' | 'PINS' | null; gumLineMm: number; colourSensitivity: number }

/**
 * The stored gum line (0 to 12) is 6 plus the dentist's adjustment, -4 to +4 mm from each
 * tooth's own gum line (more shows more of the scanned crown).
 */
const NEUTRAL_GUM_LINE = 6
const GUM_ADJUST_RANGE = 4
/**
 * The scan is cut this far above each tooth's neck. The standard gum's edge sits 0.5 mm above
 * the neck, so the crown runs a little under it: no gap, no gum poking through.
 */
const CUT_ABOVE_NECK_MM = 0.2
/** How far up the cut crown the gum colour fades out, mm. */
const COLLAR_MM = 2.4
const DEFAULT_SENSITIVITY = 50
/** A tooth's sides reach about this far from its pin (a molar's corner at the gum line). */
const MIN_REACH_MM = 11
/** The patch around a standard tooth's biting point checked for scanned surface between two pinned teeth (see coveredBy). */
const COVER_MM = 3
/**
 * A standard crown is left out when this share of it has scanned surface within CLASH_MM: a real
 * tooth there that nobody numbered. Past the last numbered tooth more is needed, since the gum
 * behind the last molar can reach into a standard crown's space too.
 */
const CLASH_MM = 1.2
const CLASH_SHARE = 0.15
const CLASH_BEYOND = 0.35
/** Within this of a pin, the surface's average direction is the biting surface's. */
const OCCLUSAL_RADIUS_MM = 3
/** The chart page's camera (DentalChart3D), in the chart's millimetres. */
const CHART_CAMERA = { position: [0, 14, 250] as const, target: [0, -4, -22] as const }
/** Waits this long after the gum slider rests before tidying the cut edges. */
const TIDY_DELAY = 180
/** Waits this long after the last change before saving the view for everyone. */
const SAVE_DELAY = 700

const toolButton =
  'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-sm font-medium outline-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11'
const panelButton =
  'inline-flex h-8 items-center justify-center rounded-md border border-white/25 px-3 text-sm font-medium text-neutral-100 outline-white transition-colors duration-150 hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11'

/** "17–14, 11–23": the scanned teeth as runs in arch order. */
function toothRuns(teeth: ReadonlySet<FdiCode>) {
  const runs: string[] = []
  for (const order of [ARCH_ORDER.upper, ARCH_ORDER.lower]) {
    let start: FdiCode | null = null
    let last: FdiCode | null = null
    for (const tooth of [...order, null]) {
      if (tooth && teeth.has(tooth)) {
        start ??= tooth
        last = tooth
        continue
      }
      if (start && last) runs.push(start === last ? start : `${start}–${last}`)
      start = null
      last = null
    }
  }
  return runs.join(', ')
}

/**
 * How the scan is shown: on its own or placed in the chart's standard skull (bent to meet it),
 * and with its gums shown or hidden. Display only: the file is never changed. A dentist's
 * changes become the scan's view for everyone, saved quietly a moment after the last change.
 */
export function ScanViewOptions({ patientId, scan, layer, pins, busy, canSave, chart, axisHint, selected, onStandardTeeth, onAxis, onFix, onPanel }: Props) {
  const { viewer, mesh, tools, more } = layer
  const settingsQuery = useScanViewSettings(patientId, scan.id)
  const save = useSaveScanViewSettings(patientId, scan.id)
  const [local, setLocal] = useState<Settings | null>(null)
  const [adjusting, setAdjusting] = useState(false)

  // Each jaw's gum-to-biting direction: the normal of the plane through its pins when they
  // spread across the arch; else the detector's, when it ran this visit; else read from the
  // surface around the pins (back teeth first: front teeth's slopes lean it). The surface (or,
  // for one jaw, the rest of the scan lying on the gum side) says which way round it points.
  const jaws = jawsOf(pins.map((p) => p.tooth))
  const unitsPerMm = mesh.transform.scale
  const axes = useMemo(() => {
    const out: Partial<Record<Jaw, Vec3>> = {}
    const positions = viewer.positions
    const normals = viewer.normals
    if (!positions || !normals) return out
    const centre = meanPoint(positions)
    for (const jaw of ['upper', 'lower'] as const) {
      const jawPins = pins.filter((p) => jawOfTooth(p.tooth) === jaw)
      const own = jawPins.map((p) => p.at)
      if (own.length === 0) continue
      const back = jawPins.filter((p) => Number(p.tooth[1]) >= 4).map((p) => p.at)
      const surface = surfaceOcclusal(positions, normals, back.length > 0 ? back : own, OCCLUSAL_RADIUS_MM * unitsPerMm)
      const plane = pinPlaneNormal(own)
      const hint = axisHint?.jaw === jaw ? axisHint.axis : null
      let axis: Vec3 | null = plane ?? hint ?? surface
      if (!axis) continue
      const agree = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= 0
      if (plane) {
        const guide = hint ?? surface
        if (guide && !agree(plane, guide)) axis = [-plane[0], -plane[1], -plane[2]]
      } else if (!hint && jaws !== 'both') {
        const pinCentre = meanPoint(Float32Array.from(own.flat()))
        const toPins: Vec3 = [pinCentre[0] - centre[0], pinCentre[1] - centre[1], pinCentre[2] - centre[2]]
        if (!agree(toPins, axis)) axis = [-axis[0], -axis[1], -axis[2]]
      }
      out[jaw] = axis
    }
    return out
  }, [viewer, pins, jaws, axisHint, unitsPerMm])

  // Placing the scan: its pins (in the file's own millimetres) onto the same teeth of the standard model.
  const filePins = useMemo(
    () =>
      pins.map((p) => {
        const at = toFile(p, mesh.transform)
        return { tooth: p.tooth, at: [at.x, at.y, at.z] as Vec3, neck: at.neck ? ([at.neck.x, at.neck.y, at.neck.z] as Vec3) : null }
      }),
    [pins, mesh.transform],
  )
  const fitted = useMemo<Placement | null>(() => (pins.length < MIN_PINS ? null : placeScan(filePins, axes, jawOpenFor)), [pins.length, filePins, axes])
  const positions = viewer.positions
  const pinsKey = useMemo(() => pins.map((p) => `${p.tooth}:${p.at.join(',')}`).join('|'), [pins])
  const axesKey = JSON.stringify(axes)
  const toView = useMemo(() => (fitted ? chartToView(fitted.fit, mesh.transform) : null), [fitted, mesh.transform])
  const roughFit = fitted !== null && (fitted.outliers.length > 0 || fitted.fit.meanError > 4 || fitted.fit.scale < 0.75 || fitted.fit.scale > 1.35)

  // The saved view, or, for a scan nobody has set one for, the skull with the gums hidden once it can be placed.
  const saved: Settings = useMemo(() => {
    const s: ScanViewSettings | undefined = settingsQuery.data
    const chosen = Boolean(s?.updatedAt)
    return {
      view: chosen ? s!.view : fitted ? 'IN_SKULL' : 'SCAN_ONLY',
      hideGums: chosen ? s!.hideGums : Boolean(fitted),
      gumMethod: s?.gumMethod ?? null,
      gumLineMm: s?.gumLineMm ?? NEUTRAL_GUM_LINE,
      colourSensitivity: s?.colourSensitivity ?? DEFAULT_SENSITIVITY,
    }
  }, [settingsQuery.data, fitted])
  const current = local ?? saved

  const hasColours = viewer.colors !== null
  const method: 'COLOUR' | 'PINS' | null =
    current.gumMethod === 'COLOUR' && hasColours ? 'COLOUR' : fitted ? 'PINS' : hasColours ? 'COLOUR' : null
  const inSkull = !busy && current.view === 'IN_SKULL' && fitted !== null

  // The gum line follows the dentist's adjustment once the slider is let go (bending the model
  // again is too slow to do while it moves; the scan's cut follows live).
  const [settledGumLine, setSettledGumLine] = useState<number | null>(null)
  const gumShift = method === 'PINS' ? (settledGumLine ?? current.gumLineMm) - NEUTRAL_GUM_LINE : 0
  // Each scanned tooth's gum line, read once from the scan's shape (in a worker) around the first
  // placement; then the placement is made again with the standard gum line at the patient's.
  const lineKey = `${pinsKey}|${axesKey}`
  const [lines, setLines] = useState<{ key: string; value: { lines: ReadonlyMap<FdiCode, number>; cheeks: ReadonlyMap<FdiCode, number> } } | null>(null)
  useEffect(() => {
    if (!fitted || !positions || lines?.key === lineKey) return
    const teeth = pins.map((p) => p.tooth)
    const { frames, outlines } = toothFrames(fitted, teeth, mesh.transform)
    const flatPins = new Float32Array(pins.length * 3)
    pins.forEach((pin, i) => flatPins.set(pin.at, i * 3))
    const request: GumRequest = { kind: 'gumLines', positions: positions.slice(), pins: flatPins, frames, outlines, reach: Math.max(reachOf(pins), MIN_REACH_MM * unitsPerMm) }
    const worker = new Worker(new URL('../viewer/gumWorker.ts', import.meta.url), { type: 'module' })
    const done = (value: { lines: ReadonlyMap<FdiCode, number>; cheeks: ReadonlyMap<FdiCode, number> }) => {
      worker.terminate()
      setLines({ key: lineKey, value })
    }
    worker.onmessage = (event: MessageEvent<GumResponse>) => {
      if (event.data.kind !== 'values') return
      const read = event.data.values
      const pick = (k: number) => new Map(teeth.flatMap((tooth, i) => (Number.isFinite(read[i * 2 + k]) ? [[tooth, read[i * 2 + k]] as const] : [])))
      done({ lines: pick(0), cheeks: pick(1) })
    }
    worker.onerror = () => done({ lines: new Map(), cheeks: new Map() })
    worker.postMessage(request, [request.positions.buffer])
    return () => worker.terminate()
  }, [fitted, positions, lines, lineKey, pins, mesh.transform, unitsPerMm])
  const lineValue = lines?.key === lineKey ? lines.value : null
  const placement = useMemo(
    () => (fitted && lineValue ? placeScan(filePins, axes, jawOpenFor, gumShift, lineValue.lines, lineValue.cheeks) : null),
    [fitted, lineValue, gumShift, filePins, axes],
  )
  const hideGums = !busy && current.hideGums && method !== null

  // Saving: a moment after the last change, only for dentists and admins.
  const timer = useRef(0)
  const persist = useCallback(
    (next: Settings, now = false) => {
      if (!canSave) return
      window.clearTimeout(timer.current)
      const send = () =>
        save.mutate({
          view: next.view,
          hideGums: next.hideGums,
          gumMethod: next.hideGums ? (next.gumMethod ?? method) : next.gumMethod,
          gumLineMm: next.gumLineMm,
          colourSensitivity: next.colourSensitivity,
        })
      if (now) send()
      else timer.current = window.setTimeout(send, SAVE_DELAY)
    },
    [canSave, save, method],
  )
  useEffect(() => () => window.clearTimeout(timer.current), [])
  /** A change; saved for everyone unless `later` (a slider still moving: saved when let go). */
  const change = (patch: Partial<Settings>, later = false) => {
    save.reset()
    const next = { ...current, ...patch }
    setLocal(next)
    if (!later) persist(next)
  }

  // Which standard teeth the scan shows: those pinned, and any its surface covers (a tooth the
  // detector or the dentist left unnumbered).
  const { scanned, extra } = useMemo(() => {
    const scanned = new Set(pins.map((p) => p.tooth))
    /** Covered teeth with no pin, at their standard biting point (viewer coordinates). */
    const extra: ViewPin[] = []
    if (!placement || !toView || !positions) return { scanned, extra }
    const bites = bentBitePoints(placement)
    const candidates = [...bites.keys()].filter((code) => !scanned.has(code) && (placement.jaws === 'both' || jawOfTooth(code) === placement.jaws))
    const points = candidates.map((code) => {
      const v = new Vector3(...bites.get(code)!).applyMatrix4(toView)
      return [v.x, v.y, v.z] as Vec3
    })
    const inside = candidates.map((code) => {
      const order = jawOfTooth(code) === 'upper' ? ARCH_ORDER.upper : ARCH_ORDER.lower
      const at = order.indexOf(code)
      return order.slice(0, at).some((t) => scanned.has(t)) && order.slice(at + 1).some((t) => scanned.has(t))
    })
    const perMm2 = pointsPerMm2(positions, viewer.triangleIndex, unitsPerMm)
    const pinned = pins.map((p) => p.at)
    const near = coveredBy(positions, points, pinned, COVER_MM * unitsPerMm, unitsPerMm, perMm2)
    // A standard crown whose space the scan already fills (a real tooth the detector left
    // unnumbered, or one numbered wrongly) would sit through it: leave it out too.
    const crowns = candidates.map((code) =>
      standardCrownPoints(placement, code).map((p) => {
        const v = new Vector3(...p).applyMatrix4(toView)
        return [v.x, v.y, v.z] as Vec3
      }),
    )
    const filled = occupiedShare(positions, crowns, CLASH_MM * unitsPerMm)
    candidates.forEach((code, i) => {
      // Between scanned teeth, a patch of surface at the biting point is enough; past the last
      // one the scan often runs on over the gum behind it, so only a crown-sized clash counts.
      const covered = inside[i] ? near[i] || filled[i] >= CLASH_SHARE : filled[i] >= CLASH_BEYOND
      if (covered) extra.push({ tooth: code, at: points[i] })
      // Between two scanned teeth the scan shows that stretch of the arch: with no tooth there
      // (a gap, or the space closed up) the patient has none, so no standard tooth is drawn.
      if (covered || inside[i]) scanned.add(code)
    })
    return { scanned, extra }
  }, [pins, placement, toView, positions, unitsPerMm, viewer])
  const absentKey = useMemo(
    () =>
      Object.entries(chart?.teeth ?? {})
        .filter(([, now]) => now && (now.condition === 'MISSING' || now.condition === 'EXTRACTED'))
        .map(([tooth]) => tooth)
        .sort()
        .join(','),
    [chart],
  )
  const scannedKey = [...scanned].sort().join(',')

  // The skull: built when shown, around the scan, and taken away again. The bend is worked out
  // once here, never per frame.
  const [scene, setScene] = useState<SkullScene | null>(null)
  const reportTeeth = useRef(onStandardTeeth)
  useEffect(() => {
    reportTeeth.current = onStandardTeeth
  })
  // Built again only when the placement, the scanned teeth or the chart's missing teeth change;
  // the new one replaces the old in place, so the camera stays where it is.
  const shown = useRef<SkullScene | null>(null)
  useEffect(() => {
    if (!inSkull || !placement || !toView) return
    const run = { cancelled: false }
    const absent = new Set(absentKey.split(',').filter(Boolean) as FdiCode[])
    const covered = new Set(scannedKey.split(',').filter(Boolean) as FdiCode[])
    buildSkullScene({ placement, toView, scanned: covered, absent })
      .then((made) => {
        if (run.cancelled) return made.dispose()
        shown.current?.dispose()
        shown.current = made
        viewer.setOverlay(made.group)
        setScene(made)
        reportTeeth.current(made.teeth.map((t) => ({ tooth: t.tooth, anchor: t.anchor })))
      })
      .catch((error: unknown) => console.error('Skull model failed to load', error))
    return () => {
      run.cancelled = true
    }
  }, [inSkull, placement, toView, viewer, absentKey, scannedKey])
  // Leaving the skull takes it away.
  useEffect(() => {
    if (!inSkull) return
    return () => {
      viewer.setOverlay(null)
      setScene(null)
      reportTeeth.current([])
      shown.current?.dispose()
      shown.current = null
    }
  }, [inSkull, viewer])
  // In the skull, Reset view looks at it exactly as the chart page looks at its model.
  useEffect(() => {
    if (!inSkull || !toView) return
    const at = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(toView)
    const target = at(...CHART_CAMERA.target)
    // On a narrow stage (a phone) come closer: the teeth matter more than the whole skull.
    const narrow = viewer.canvas.clientWidth < viewer.canvas.clientHeight
    const position = at(...CHART_CAMERA.position).sub(target).multiplyScalar(narrow ? 0.6 : 1).add(target)
    const up = new Vector3(0, 1, 0).transformDirection(toView)
    viewer.setHome({ position: [position.x, position.y, position.z], target: [target.x, target.y, target.z], up: [up.x, up.y, up.z] })
    viewer.resetView()
    return () => {
      viewer.setHome(null)
      viewer.resetView()
    }
  }, [inSkull, toView, viewer])

  const reportAxis = useRef(onAxis)
  useEffect(() => {
    reportAxis.current = onAxis
  })
  // On its own, the scan faces its biting surfaces, front teeth at the top (when its axis is known).
  const ownAxis = jaws === 'upper' || jaws === 'lower' ? axes[jaws] : undefined
  useEffect(() => reportAxis.current?.(ownAxis ?? null), [ownAxis])
  useEffect(() => {
    if (busy || inSkull || !ownAxis || pins.length === 0) return
    viewer.setHome(occlusalView(ownAxis, pins))
    viewer.resetView()
    return () => {
      viewer.setHome(null)
    }
  }, [busy, inSkull, ownAxis, pins, viewer])

  useEffect(() => {
    if (!scene) return
    scene.select(selected)
    viewer.draw()
  }, [scene, selected, viewer])

  // The gums: one number per vertex, worked out in a worker the first time they are hidden. The
  // worker stays, keeping the surface, to tidy the cut edges whenever the slider rests.
  const workKey = method === 'PINS' ? (placement ? `PINS|${pinsKey}|${axesKey}|${scannedKey}` : null) : method
  const [values, setValues] = useState<{ key: string; data: Float32Array } | null>(null)
  const ready = values && values.key === workKey ? values.data : null
  const working = hideGums && method !== null && !ready
  const gumWorker = useRef<{ key: string; worker: Worker } | null>(null)
  useEffect(() => {
    if (!hideGums || !method || !workKey || (values && values.key === workKey)) return
    if (!positions) return
    const index = viewer.triangleIndex
    let request: GumRequest
    if (method === 'COLOUR') {
      const colors = viewer.colors
      if (!colors) return
      request = { kind: 'colour', positions: positions.slice(), index: index?.slice() ?? null, colors: colors.slice(), unitsPerMm }
    } else {
      if (!placement) return
      const teeth = [...pins, ...extra]
      const flatPins = new Float32Array(teeth.length * 3)
      teeth.forEach((pin, i) => flatPins.set(pin.at, i * 3))
      const { frames, outlines } = toothFrames(placement, teeth.map((t) => t.tooth), mesh.transform)
      request = {
        kind: 'teeth',
        positions: positions.slice(),
        index: index?.slice() ?? null,
        pins: flatPins,
        frames,
        outlines,
        reach: Math.max(reachOf(teeth), MIN_REACH_MM * unitsPerMm),
        unitsPerMm,
      }
    }
    gumWorker.current?.worker.terminate()
    const worker = new Worker(new URL('../viewer/gumWorker.ts', import.meta.url), { type: 'module' })
    gumWorker.current = { key: workKey, worker }
    worker.onmessage = (event: MessageEvent<GumResponse>) => {
      if (event.data.kind === 'values') setValues({ key: workKey, data: event.data.values })
    }
    worker.onerror = () => worker.terminate()
    worker.postMessage(request, request.index ? [request.positions.buffer, request.index.buffer] : [request.positions.buffer])
  }, [hideGums, method, workKey, values, viewer, positions, placement, pins, extra, mesh.transform, unitsPerMm])
  useEffect(
    () => () => {
      gumWorker.current?.worker.terminate()
      gumWorker.current = null
    },
    [],
  )

  const adjustment = current.gumLineMm - NEUTRAL_GUM_LINE
  const threshold = method === 'PINS' ? CUT_ABOVE_NECK_MM - adjustment : -rednessLimit(current.colourSensitivity)
  // While the slider moves, the plain cut (quick); a moment after it rests, the tidied one.
  const [tidy, setTidy] = useState<{ key: string; triangles: Uint32Array; edge: { indices: Uint32Array; positions: Float32Array } | null } | null>(null)
  const tidyKey = `${workKey}|${threshold}`
  useEffect(() => {
    if (!hideGums || !ready) {
      viewer.setEdgeShift(null)
      viewer.setVisibleTriangles(null)
      return
    }
    if (tidy?.key === tidyKey) {
      const triangles = tidy.triangles
      viewer.setEdgeShift(tidy.edge)
      viewer.setVisibleTriangles((out) => {
        out.set(triangles)
        return triangles.length
      })
      return
    }
    viewer.setEdgeShift(null)
    const index = viewer.triangleIndex
    const count = ready.length
    viewer.setVisibleTriangles((out) => keptTriangles(index, count, ready, threshold, out).length)
  }, [viewer, hideGums, ready, threshold, tidy, tidyKey])
  useEffect(() => {
    const current = gumWorker.current
    if (!hideGums || !ready || !current || current.key !== workKey || tidy?.key === tidyKey) return
    const id = Date.now()
    const timer = window.setTimeout(() => {
      current.worker.onmessage = (event: MessageEvent<GumResponse>) => {
        if (event.data.kind === 'clean' && event.data.id === id) setTidy({ key: tidyKey, triangles: event.data.triangles, edge: event.data.edge })
      }
      const request: GumRequest = { kind: 'clean', threshold, id }
      current.worker.postMessage(request)
    }, TIDY_DELAY)
    return () => window.clearTimeout(timer)
  }, [hideGums, ready, workKey, threshold, tidy, tidyKey])
  useEffect(
    () => () => {
      viewer.setEdgeShift(null)
      viewer.setVisibleTriangles(null)
    },
    [viewer],
  )
  // In the skull, the last stretch of each cut crown takes on the gum's colour, so it melts into
  // the standard gum instead of ending in a hard edge.
  const collar = inSkull && hideGums && method === 'PINS' ? ready : null
  useEffect(() => {
    viewer.setCollar(collar, threshold, threshold + COLLAR_MM, GUM_COLLAR)
  }, [viewer, collar, threshold])
  useEffect(() => () => viewer.setCollar(null), [viewer])


  const showAdjust = adjusting && hideGums && !busy
  const panelShown = !busy && (inSkull || showAdjust || save.isError)
  const onPanelRef = useRef(onPanel)
  useEffect(() => {
    onPanelRef.current = onPanel
  })
  useEffect(() => {
    onPanelRef.current(panelShown)
  }, [panelShown])

  if (busy) return null

  const standardShown = placement && scene ? scene.teeth.length > 0 : false
  const far = fitted ? (fitted.outliers.length > 0 ? fitted.outliers : [pins[fitted.fit.worst]?.tooth].filter(Boolean)) : []

  return (
    <>
      {tools &&
        createPortal(
          <>
            {fitted && (
              <div className="flex items-center rounded-md border border-white/20 bg-neutral-950/70 p-0.5" role="group" aria-label="View">
                {(
                  [
                    ['IN_SKULL', 'In skull'],
                    ['SCAN_ONLY', 'Scan only'],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={current.view === value}
                    onClick={() => change({ view: value })}
                    className={`${toolButton} ${current.view === value ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:text-white'}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
            {method && (
              <button
                type="button"
                aria-pressed={current.hideGums}
                onClick={() => change({ hideGums: !current.hideGums })}
                className={`${toolButton} border border-white/20 ${current.hideGums ? 'bg-white text-neutral-950' : 'bg-neutral-950/70 text-neutral-300 hover:text-white'}`}
              >
                Hide gums
              </button>
            )}
          </>,
          tools,
        )}
      {more &&
        hideGums &&
        createPortal(
          <button type="button" onClick={() => setAdjusting(true)} className={`${menuItem} order-2`}>
            <MenuTick on={false} /> Adjust gum line…
          </button>,
          more,
        )}

      {panelShown && (
        <div className="absolute top-2 left-2 max-h-[calc(100%-7rem)] w-[min(20rem,calc(100%-1rem))] overflow-y-auto rounded-md border border-white/15 bg-neutral-950/70 px-3 py-2 text-xs/5 text-neutral-300 sm:top-3 sm:left-3">
          {inSkull && placement && (
            <section aria-label="In skull">
              <p className="text-white" role="status">
                Fitted to {pins.length - placement.outliers.length} {pins.length - placement.outliers.length === 1 ? 'tooth' : 'teeth'} · {placement.miss.toFixed(1)} mm off
              </p>
              {standardShown && (
                <p>
                  Scanned: {toothRuns(new Set(pins.map((p) => p.tooth)))}. Other teeth are standard models.
                </p>
              )}
              {roughFit ? (
                <div className="mt-1.5">
                  <p className="font-semibold text-white">
                    Check the numbers{far.length === 1 ? `: tooth ${far[0]} is far from where it belongs` : far.length > 1 ? `: teeth ${far.join(', ')} are far from where they belong` : ''}.
                  </p>
                  {fitted && fitted.outliers.length > 0 && <p className="mt-0.5">Left out of the fit until fixed.</p>}
                  {onFix && (
                    <button type="button" onClick={onFix} className={`${panelButton} mt-1.5`}>
                      Fix numbers
                    </button>
                  )}
                </div>
              ) : (
                pins.length < PINS_FOR_GOOD_FIT && <p className="mt-0.5">Few teeth: the skull’s angle is approximate.</p>
              )}
              <p className="mt-1 text-[11px]/4 text-neutral-500">Illustration, not the patient’s bone. Roots not shown.</p>
            </section>
          )}

          {showAdjust && (
            <section aria-label="Gum line" className={inSkull ? 'mt-2 border-t border-white/15 pt-2' : ''}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Gum line</h2>
                <button type="button" aria-label="Close" onClick={() => setAdjusting(false)} className="-mr-1.5 grid size-8 place-items-center rounded text-neutral-400 outline-white hover:text-white focus-visible:outline-2 pointer-coarse:size-11">
                  <CloseIcon className="size-4" />
                </button>
              </div>
              {hasColours && fitted && (
                <div className="mt-1 flex items-center rounded-md border border-white/20 p-0.5" role="group" aria-label="Find the gums by">
                  {(
                    [
                      ['PINS', 'By tooth'],
                      ['COLOUR', 'By colour'],
                    ] as const
                  ).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={method === value}
                      onClick={() => change({ gumMethod: value })}
                      className={`${toolButton} flex-1 justify-center ${method === value ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:text-white'}`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              {method === 'PINS' ? (
                <label className="mt-1.5 block">
                  <span className="flex justify-between gap-3">
                    <span>Less tooth</span>
                    <span className="text-white tabular-nums">{adjustment === 0 ? 'Standard' : `${Math.abs(adjustment).toFixed(1)} mm ${adjustment > 0 ? 'more' : 'less'}`}</span>
                    <span>More tooth</span>
                  </span>
                  <input
                    type="range"
                    min={NEUTRAL_GUM_LINE - GUM_ADJUST_RANGE}
                    max={NEUTRAL_GUM_LINE + GUM_ADJUST_RANGE}
                    step={0.25}
                    value={current.gumLineMm}
                    aria-label="Gum line"
                    aria-valuetext={adjustment === 0 ? 'Standard gum line' : `${Math.abs(adjustment).toFixed(1)} mm ${adjustment > 0 ? 'more' : 'less'} tooth showing`}
                    onPointerDown={() => setSettledGumLine(current.gumLineMm)}
                    onKeyDown={() => setSettledGumLine((now) => now ?? current.gumLineMm)}
                    onChange={(event) => change({ gumLineMm: Number(event.target.value), gumMethod: 'PINS' }, true)}
                    onPointerUp={() => {
                      setSettledGumLine(current.gumLineMm)
                      persist(current)
                    }}
                    onKeyUp={() => {
                      setSettledGumLine(current.gumLineMm)
                      persist(current)
                    }}
                    className="mt-1 w-full accent-white pointer-coarse:h-8"
                  />
                </label>
              ) : (
                <label className="mt-1.5 block">
                  <span className="flex justify-between gap-3">
                    <span>Hide less pink</span>
                    <span>Hide more</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={current.colourSensitivity}
                    aria-label="Sensitivity"
                    onChange={(event) => change({ colourSensitivity: Number(event.target.value), gumMethod: 'COLOUR' }, true)}
                    onPointerUp={() => persist(current)}
                    onKeyUp={() => persist(current)}
                    className="mt-1 w-full accent-white pointer-coarse:h-8"
                  />
                </label>
              )}
              <p className="mt-0.5 text-neutral-500" role="status">
                {working ? 'Finding the gums…' : 'Display only: the file is not changed.'}
              </p>
            </section>
          )}
          {save.isError && (
            <p role="alert" className="mt-2 rounded bg-white px-2.5 py-1.5 text-neutral-950">
              The view wasn’t saved. {scanErrorMessage(save.error)}
            </p>
          )}
        </div>
      )}
    </>
  )
}
