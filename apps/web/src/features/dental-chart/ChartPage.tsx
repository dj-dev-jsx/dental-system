import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorBox } from '../../components/ErrorBox'
import { ArrowLeftIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { ageLabel, fullName } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { canShow3D } from '../../lib/webgl'
import { useStaffUser } from '../auth/authStore'
import { usePatient } from '../patients/queries'
import { useChart } from './api'
import { ChartPanel } from './components/ChartPanel'
import { ToothCallout } from './components/ToothCallout'
import { ToothGrid } from './components/ToothGrid'
import { FDI_CODES, type FdiCode } from './model/fdi'
import { statusOf, type ToothStatus } from './model/status'
import type { Anchor } from './three/AnchorTracker'

// The 3D model is most of the app's download, so it loads only when it's shown.
const DentalChart3D = lazy(() => import('./three/DentalChart3D').then((module) => ({ default: module.DentalChart3D })))

type View = '3d' | 'flat'

/** The size of an element, kept up to date as the window or layout changes. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * One patient's dental chart: the 3D model (or its flat version) on a black stage, the
 * numbered teeth along its foot, and the chosen tooth's state and history beside it.
 */
export default function ChartPage() {
  const { id = '' } = useParams()
  const user = useStaffUser()
  const patient = usePatient(id)
  const chart = useChart(id)
  const [selected, setSelected] = useState<FdiCode | null>(null)
  const [supports3D] = useState(canShow3D)
  const [view, setView] = useState<View>(supports3D ? '3d' : 'flat')
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [stageRef, stage] = useSize<HTMLDivElement>()
  useDocumentTitle(patient.data ? `Chart: ${fullName(patient.data)}` : 'Dental chart')

  const canWrite = user.role === 'DENTIST' || user.role === 'ADMIN'
  const error = patient.error ?? chart.error

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <Link to={`/app/patients/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
          <ArrowLeftIcon className="size-4" /> Patient
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em]">Chart not available</h1>
        <ErrorBox className="mt-4">{errorMessage(error)}</ErrorBox>
      </div>
    )
  }

  const teeth = chart.data?.teeth ?? {}
  const toothStates = Object.fromEntries(
    FDI_CODES.map((code) => [code, teeth[code] ? statusOf(teeth[code].condition) : 'healthy']),
  ) as Record<FdiCode, ToothStatus>

  return (
    // One split, like the sign-in screen: the film-black side (with the sidebar beside it)
    // holds the teeth, the white panel holds the words.
    <div className="flex h-full min-h-[40rem] flex-col lg:flex-row">
      {/* The lightbox: the teeth on black, the way a dentist reads film. */}
      <section aria-label="Teeth" className="flex h-[88svh] min-w-0 flex-col bg-neutral-950 text-white lg:h-auto lg:flex-1 lg:border-l lg:border-white/10">
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-5">
          <Link to={`/app/patients/${id}`} aria-label="Back to the patient’s record" className="grid size-9 place-items-center rounded-md text-neutral-400 outline-white hover:bg-white/10 hover:text-white focus-visible:outline-2">
            <ArrowLeftIcon />
          </Link>
          <div className="min-w-0 flex-1">
            {patient.data ? (
              <>
                <h1 className="truncate text-xl font-bold tracking-[-0.02em]">{fullName(patient.data)}</h1>
                <p className="text-sm text-neutral-400">
                  Dental chart · {ageLabel(patient.data.birthDate)}
                  {patient.data.archivedAt && ' · Archived'}
                </p>
              </>
            ) : (
              <div className="h-11 w-64 rounded bg-white/10" aria-busy="true" />
            )}
          </div>
          <div className="flex rounded-md border border-white/20 p-0.5" role="group" aria-label="Chart view">
            {(
              [
                ['3d', '3D', ' model'],
                ['flat', 'Flat', ' chart'],
              ] as const
            ).map(([value, label, more]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                disabled={value === '3d' && !supports3D}
                title={value === '3d' && !supports3D ? 'This computer can’t show 3D' : undefined}
                onClick={() => setView(value)}
                className={`h-8 rounded px-3 text-sm font-medium outline-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:text-neutral-600 ${
                  view === value ? 'bg-white text-neutral-950' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {label}
                {/* The full name where there's room; "3D" and "Flat" on phones. */}
                <span className="hidden sm:inline">{more}</span>
              </button>
            ))}
          </div>
        </div>

        <div ref={stageRef} className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_46%,#262626_0%,#0a0a0a_72%)]">
          {chart.isPending ? (
            <p className="appear-late absolute inset-0 grid place-items-center text-sm text-neutral-400">Loading the chart…</p>
          ) : view === '3d' ? (
            <>
              <Suspense fallback={<p className="appear-late absolute inset-0 grid place-items-center text-sm text-neutral-400">Loading the 3D model…</p>}>
                <DentalChart3D toothStates={toothStates} selected={selected} onSelect={setSelected} onAnchor={setAnchor} />
              </Suspense>
              {/* Only where there's room beside the teeth; on a phone the panel right below says the same. */}
              {selected && anchor && stage && stage.width >= 560 && (
                <ToothCallout
                  tooth={selected}
                  anchor={anchor}
                  stage={stage}
                  now={teeth[selected]}
                  latest={chart.data?.records.find((record) => record.id === teeth[selected]?.recordId)}
                />
              )}
              <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 text-xs whitespace-nowrap text-neutral-500 sm:block">
                Drag to turn · scroll to zoom · click a tooth
              </p>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center overflow-x-auto px-4">
              <div className="mx-auto w-full max-w-5xl">
                <ToothGrid teeth={teeth} selected={selected} onSelect={setSelected} large />
              </div>
            </div>
          )}
        </div>
        {view === '3d' && !chart.isPending && (
          <div className="shrink-0 overflow-x-auto px-4 pt-2 pb-4 sm:px-5">
            <ToothGrid teeth={teeth} selected={selected} onSelect={setSelected} />
          </div>
        )}
      </section>

      {chart.data && patient.data ? (
        <ChartPanel
          patientId={id}
          chart={chart.data}
          selected={selected}
          onSelect={setSelected}
          canWrite={canWrite}
          archived={Boolean(patient.data.archivedAt)}
        />
      ) : (
        <div className="bg-white p-6 lg:w-[26rem]" aria-busy="true">
          <div className="h-6 w-32 rounded bg-neutral-100" />
          <div className="mt-6 h-48 rounded bg-neutral-100" />
        </div>
      )}
    </div>
  )
}
