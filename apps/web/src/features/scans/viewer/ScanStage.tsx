import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon, FullscreenIcon, ResetViewIcon } from '../../../components/icons'
import { formatDate } from '../../../lib/format'
import { canShow3D } from '../../../lib/webgl'
import { formatBytes, type Scan } from '../types'
import { loadScan, ScanLoadError, type LoadProgress } from './loadScan'
import type { ParsedMesh } from './parseTypes'
import { ScanViewer } from './ScanViewer'

type ErrorKind = ScanLoadError['kind'] | 'context'

type Phase =
  | { name: 'loading'; progress: LoadProgress }
  | { name: 'preparing' }
  | { name: 'ready'; mesh: ReadyMesh; hasColors: boolean }
  | { name: 'error'; kind: ErrorKind }

export type ReadyMesh = Pick<ParsedMesh, 'triangles' | 'dimensions' | 'transform'>

/**
 * What a layer drawn over a ready scan gets: the viewer, the mesh, a place in the tool row for
 * the main controls, and a place in the More menu for the rest.
 */
export type StageLayer = { viewer: ScanViewer; mesh: ReadyMesh; tools: HTMLElement | null; more: HTMLElement | null }

type Props = {
  patientId: string
  scan: Scan
  /** Admins can still open a withdrawn scan; everyone else is told it was withdrawn. */
  isAdmin: boolean
  /** In a comparison, the stage names its scan in a corner. */
  caption?: boolean
  /** Hands the viewer to the page so two stages can follow each other. */
  onViewer?: (viewer: ScanViewer | null) => void
  /** Drawn over the scan once it is shown (the tooth pins). */
  children?: (layer: StageLayer) => ReactNode
  /** Hides the "drag to turn" hint, when the layer says something else there. */
  hint?: boolean
}

const WEBGL = canShow3D()
const VERY_LARGE = 1_500_000

const PANEL = 'bg-[radial-gradient(circle_at_50%_46%,#262626_0%,#0a0a0a_72%)]'
const toolButton =
  'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-sm font-medium outline-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11'

/** A line in the More menu: a toggle (with a tick when on) or an action. */
export const menuItem =
  'flex h-9 w-full items-center gap-2 rounded px-2.5 text-left text-sm text-neutral-200 outline-white hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent pointer-coarse:h-11'

/** The tick column of a menu toggle. */
export function MenuTick({ on }: { on: boolean }) {
  return <CheckIcon className={`size-4 shrink-0 ${on ? '' : 'invisible'}`} />
}

/** One scan on the black stage: loads it, shows progress and problems, and holds the view controls. */
export function ScanStage({ patientId, scan, isAdmin, caption = false, onViewer, children, hint = true }: Props) {
  const [tools, setTools] = useState<HTMLDivElement | null>(null)
  const [more, setMore] = useState<HTMLDivElement | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const [morePanel, setMorePanel] = useState<HTMLDivElement | null>(null)
  const [shown, setShown] = useState<ScanViewer | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<ScanViewer | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'loading', progress: { loaded: 0, total: scan.sizeBytes } })
  const [attempt, setAttempt] = useState(0)
  const [wireframe, setWireframe] = useState(false)
  const [colors, setColors] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const blocked = scan.withdrawn && !isAdmin

  useEffect(() => {
    if (!WEBGL || blocked) return
    const controller = new AbortController()
    let viewer: ScanViewer | null = null
    let last = 0
    setPhase({ name: 'loading', progress: { loaded: 0, total: scan.sizeBytes } })
    loadScan(
      patientId,
      scan.id,
      scan.format,
      scan.sizeBytes,
      controller.signal,
      (progress) => {
        const now = performance.now()
        if (now - last > 80 || progress.loaded >= progress.total) {
          last = now
          setPhase({ name: 'loading', progress })
        }
      },
      () => setPhase({ name: 'preparing' }),
    )
      .then((mesh) => {
        if (controller.signal.aborted || !canvasRef.current) return
        try {
          viewer = new ScanViewer(canvasRef.current)
          viewer.onContextLost(() => setPhase({ name: 'error', kind: 'context' }))
          viewer.setMesh(mesh)
        } catch {
          viewer?.dispose()
          viewer = null
          setPhase({ name: 'error', kind: 'parse' })
          return
        }
        viewerRef.current = viewer
        setShown(viewer)
        onViewer?.(viewer)
        setPhase({ name: 'ready', mesh: { triangles: mesh.triangles, dimensions: mesh.dimensions, transform: mesh.transform }, hasColors: Boolean(mesh.colors) })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setPhase({ name: 'error', kind: error instanceof ScanLoadError ? error.kind : 'parse' })
      })
    return () => {
      controller.abort() // stops the download and the worker
      onViewer?.(null)
      viewerRef.current = null
      setShown(null)
      viewer?.dispose()
    }
    // onViewer is a stable setter from the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, scan.id, scan.format, scan.sizeBytes, blocked, attempt])

  useEffect(() => viewerRef.current?.setWireframe(wireframe), [wireframe, phase.name])
  useEffect(() => viewerRef.current?.setColors(colors), [colors, phase.name])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // The More menu closes on Esc, on a click outside it, and after an action inside it (toggles
  // marked data-keep-open leave it open).
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [moreOpen])

  // Items come from several layers (some through portals), so listen on the element itself.
  useEffect(() => {
    if (!morePanel) return
    const onClick = (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('button')
      if (item && !item.hasAttribute('data-keep-open')) setMoreOpen(false)
    }
    morePanel.addEventListener('click', onClick)
    return () => morePanel.removeEventListener('click', onClick)
  }, [morePanel])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageRef.current?.requestFullscreen?.()
  }, [])

  const ready = phase.name === 'ready'
  // Where there is little room (phones, or two stages side by side) the buttons keep only their icons.
  const compact = caption ? 'sr-only' : 'sr-only sm:not-sr-only'
  return (
    <div ref={stageRef} className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${PANEL}`}>
      <div ref={canvasRef} className="absolute inset-0" />

      {caption && (
        <p className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-1.5rem)] truncate text-sm text-white">
          <span className="font-semibold">{scan.title}</span> <span className="text-neutral-400">· {formatDate(scan.scannedOn)}</span>
        </p>
      )}

      {!WEBGL ? (
        <Message title="This computer can’t show 3D" scan={scan}>
          The file is stored safely and can’t be turned on screen here. Open the patient on a computer that supports 3D to look at it.
        </Message>
      ) : blocked ? (
        <Message title="This scan was withdrawn" scan={scan}>
          {scan.withdrawReason ? `Reason: ${scan.withdrawReason}` : 'It can no longer be opened.'}
        </Message>
      ) : phase.name === 'loading' ? (
        <Progress progress={phase.progress} />
      ) : phase.name === 'preparing' ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center" role="status">
          <div>
            <p className="text-sm text-white">Preparing the 3D model…</p>
            <p className="mt-1 text-sm text-neutral-400">Large scans take a few seconds.</p>
          </div>
        </div>
      ) : phase.name === 'error' ? (
        <ErrorState kind={phase.kind} scan={scan} onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}

      {ready && phase.mesh.triangles > VERY_LARGE && (
        <p className="pointer-events-none absolute top-3 right-3 max-w-xs rounded bg-white/10 px-2.5 py-1.5 text-right text-xs/5 text-neutral-200">
          Very large scan ({(phase.mesh.triangles / 1e6).toFixed(1)} million triangles). It may turn more slowly on this computer.
        </p>
      )}

      {ready && (
        <div className="absolute inset-x-2 bottom-2 sm:inset-x-3 sm:bottom-3">
          {!caption && hint && (
            // Above the tools, however many rows they take.
            <p className="pointer-events-none mb-2 hidden text-center text-xs text-neutral-500 lg:block">Drag to turn · scroll to zoom · right-drag to move</p>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <div ref={setTools} className="contents" />
            <button type="button" aria-label="Reset view" onClick={() => viewerRef.current?.resetView()} className={`${toolButton} border border-white/20 bg-neutral-950/70 text-neutral-300 hover:text-white`}>
              <ResetViewIcon className="size-4" /> <span className={compact}>Reset view</span>
            </button>
            <div ref={moreRef} className="relative">
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-controls={`more-${scan.id}`}
                onClick={() => setMoreOpen((on) => !on)}
                className={`${toolButton} border border-white/20 ${moreOpen ? 'bg-white text-neutral-950' : 'bg-neutral-950/70 text-neutral-300 hover:text-white'}`}
              >
                More <ChevronDownIcon className={`size-4 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              <div
                ref={setMorePanel}
                id={`more-${scan.id}`}
                hidden={!moreOpen}
                className="absolute bottom-full left-0 z-30 mb-1.5 w-64 max-w-[calc(100vw-1rem)] rounded-md border border-white/20 bg-neutral-950/95 p-1"
              >
                <div ref={setMore} className="mb-1 flex flex-col gap-0.5 border-b border-white/10 pb-1 empty:hidden" />
                <div>
                  <button type="button" data-keep-open aria-pressed={wireframe} onClick={() => setWireframe((on) => !on)} className={menuItem}>
                    <MenuTick on={wireframe} /> Wireframe
                  </button>
                  {phase.hasColors && (
                    <button type="button" data-keep-open aria-pressed={colors && !wireframe} disabled={wireframe} onClick={() => setColors((on) => !on)} className={menuItem}>
                      <MenuTick on={colors && !wireframe} /> Scanner colours
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              aria-pressed={fullscreen}
              className={`${toolButton} ml-auto border border-white/20 bg-neutral-950/70 text-neutral-300 hover:text-white`}
            >
              <FullscreenIcon className="size-4" /> <span className={compact}>{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
            </button>
          </div>
        </div>
      )}
      {ready && shown && children?.({ viewer: shown, mesh: phase.mesh, tools, more })}
    </div>
  )
}

function Progress({ progress }: { progress: LoadProgress }) {
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0
  return (
    <div className="absolute inset-0 grid place-items-center px-6" role="status">
      <div className="w-full max-w-xs">
        <p className="text-sm text-white">Opening the scan…</p>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-label="Download progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-white" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-400 tabular-nums">
          {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
        </p>
      </div>
    </div>
  )
}

function Message({ title, scan, children }: { title: string; scan: Scan; children: ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm/6 text-neutral-300">{children}</p>
        <p className="mt-4 text-sm text-neutral-400 break-all">
          {scan.fileName} · {scan.format} · {formatBytes(scan.sizeBytes)}
        </p>
      </div>
    </div>
  )
}

function ErrorState({ kind, scan, onRetry }: { kind: ErrorKind; scan: Scan; onRetry: () => void }) {
  const text: Record<ErrorKind, [string, string]> = {
    network: ['The scan didn’t download', 'The connection dropped before the file arrived. Check the internet connection, then try again.'],
    server: ['The scan didn’t download', 'The server had a problem. Try again in a moment.'],
    parse: ['This file couldn’t be opened', 'It may be damaged, or not a surface scan (a point cloud, for example). Export it from the scanner again and upload the new file.'],
    withdrawn: ['This scan was withdrawn', scan.withdrawReason ? `Reason: ${scan.withdrawReason}` : 'It can no longer be opened.'],
    forbidden: ['You can’t open this scan', 'Your role or session doesn’t allow it. Sign in again, or ask your clinic admin.'],
    missing: ['The file isn’t there', 'The scan’s record exists but its file wasn’t found. Upload it again.'],
    context: ['The 3D view stopped', 'The computer ran out of graphics memory. Close other tabs, then try again.'],
  }
  const [title, body] = text[kind]
  const retry = kind === 'network' || kind === 'server' || kind === 'context' || kind === 'parse'
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center" role="alert">
      <div className="max-w-sm">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm/6 text-neutral-300">{body}</p>
        <p className="mt-3 text-sm text-neutral-400 break-all">{scan.fileName}</p>
        {retry && (
          <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center rounded-md bg-white px-4 text-sm font-semibold text-neutral-950 outline-white hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2">
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
