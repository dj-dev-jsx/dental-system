import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { buttonOnDark } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { ArrowLeftIcon, CubeIcon, UploadIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { formatDate, fullName } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useStaffUser } from '../auth/authStore'
import { useChart } from '../dental-chart/api'
import { ToothHistory } from '../dental-chart/components/ChartPanel'
import type { FdiCode } from '../dental-chart/model/fdi'
import { usePatient } from '../patients/queries'
import { useScans } from './api'
import { ScanDetails } from './ScanDetails'
import { ScanList } from './ScanList'
import { UploadPanel } from './UploadPanel'
import type { ScanViewer } from './viewer/ScanViewer'
import { ScanStage } from './viewer/ScanStage'
import { ScanTeeth } from './teeth/ScanTeeth'

/**
 * One patient's 3D scans: the open scan on a black stage (or two, side by side), the list
 * and details on the white panel. Loaded only when opened, so three.js stays out of the
 * rest of the app.
 */
export default function ScansPage() {
  const { id = '', scanId } = useParams()
  const user = useStaffUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const patient = usePatient(id)
  const scans = useScans(id)
  useDocumentTitle(patient.data ? `3D scans: ${fullName(patient.data)}` : '3D scans')

  const isAdmin = user.role === 'ADMIN'
  const canWrite = (user.role === 'DENTIST' || isAdmin) && !patient.data?.archivedAt
  const uploading = params.get('upload') === '1' && canWrite
  const compareId = params.get('compare')
  const [sync, setSync] = useState(true)
  const [viewerA, setViewerA] = useState<ScanViewer | null>(null)
  const [viewerB, setViewerB] = useState<ScanViewer | null>(null)

  const items = scans.data ?? []
  // With no scan chosen, open the newest one that can be opened.
  const selected = items.find((s) => s.id === scanId) ?? items.find((s) => !s.withdrawn) ?? items[0] ?? null
  const comparing = items.find((s) => s.id === compareId && s.id !== selected?.id) ?? null
  const search = comparing ? `?compare=${comparing.id}` : ''
  // The picked tooth and marking mode belong to the open scan; opening another one clears them.
  const view = `${selected?.id ?? ''}|${comparing?.id ?? ''}`
  const [teethState, setTeethState] = useState<{ view: string; tooth: FdiCode | null; marking: boolean }>({ view, tooth: null, marking: false })
  const current = teethState.view === view ? teethState : { view, tooth: null, marking: false }
  const { tooth, marking } = current
  const [panelSlot, setPanelSlot] = useState<HTMLDivElement | null>(null)
  const canMark = canWrite && Boolean(selected && !selected.withdrawn) && !comparing
  // The chart is fetched only once there are teeth to click on (opening it is logged).
  const chart = useChart(id, Boolean(selected && selected.pinCount > 0) || marking)
  const pickTooth = useCallback((code: FdiCode | null) => setTeethState((s) => ({ view, tooth: code, marking: s.view === view && s.marking })), [view])
  const setMarking = useCallback((on: boolean) => setTeethState({ view, tooth: null, marking: on }), [view])
  const markTeeth = useCallback(() => setMarking(true), [setMarking])
  const comparable = items.filter((s) => s.id !== selected?.id && (isAdmin || !s.withdrawn))

  // Two views follow each other while "Sync views" is on.
  useEffect(() => {
    if (!sync || !viewerA || !viewerB) return
    const stopA = viewerA.onCameraChange(() => viewerB.setCamera(viewerA.getCamera()))
    const stopB = viewerB.onCameraChange(() => viewerA.setCamera(viewerB.getCamera()))
    viewerB.setCamera(viewerA.getCamera())
    return () => {
      stopA()
      stopB()
    }
  }, [sync, viewerA, viewerB])

  const back = (
    <Link to={`/app/patients/${id}`} aria-label="Back to the patient’s record" className="grid size-9 place-items-center rounded-md text-neutral-400 outline-white hover:bg-white/10 hover:text-white focus-visible:outline-2">
      <ArrowLeftIcon />
    </Link>
  )

  const failure = patient.error ?? scans.error
  if (failure) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <Link to={`/app/patients/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
          <ArrowLeftIcon className="size-4" /> Patient
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em]">3D scans not available</h1>
        <ErrorBox className="mt-4">{errorMessage(failure)}</ErrorBox>
        <button type="button" onClick={() => void scans.refetch()} className="mt-4 text-sm font-semibold underline underline-offset-3">
          Try again
        </button>
      </div>
    )
  }

  const setCompare = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('compare', value)
    else next.delete('compare')
    setParams(next, { replace: true })
  }

  return (
    <div className="flex h-full min-h-[40rem] flex-col lg:flex-row">
      <section aria-label="3D viewer" className={`shrink-0 min-w-0 flex-col bg-neutral-950 text-white lg:flex lg:flex-1 lg:border-l lg:border-white/10 ${uploading ? 'hidden' : 'flex'} h-[92svh] lg:h-auto lg:shrink`}>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-5">
          {back}
          <div className="min-w-0 flex-1">
            {patient.data ? (
              <>
                <h1 className="truncate text-xl font-bold tracking-[-0.02em]">{fullName(patient.data)}</h1>
                <p className="text-sm text-neutral-400">3D scans{items.length > 0 && ` · ${items.length}`}</p>
              </>
            ) : (
              <div className="h-11 w-64 rounded bg-white/10" aria-busy="true" />
            )}
          </div>
          {canWrite && items.length > 0 && (
            <button type="button" onClick={() => navigate(`/app/patients/${id}/scans${selected ? `/${selected.id}` : ''}?upload=1`)} className={`${buttonOnDark} h-9 px-3.5 text-sm`}>
              <UploadIcon className="size-4" /> Upload scan
            </button>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-3 sm:px-5">
            {/* On phones and tablets the list is hidden, and this picks the scan instead. */}
            <label className="flex w-full min-w-0 items-center gap-2 text-sm text-neutral-400 lg:hidden">
              <span className="sr-only">Scan</span>
              <select
                value={selected?.id ?? ''}
                onChange={(event) => navigate(`/app/patients/${id}/scans/${event.target.value}${search}`)}
                className="h-9 min-w-0 flex-1 rounded-md border border-white/20 bg-neutral-950 px-2 text-sm text-white outline-white focus-visible:outline-2"
              >
                {items.map((scan) => (
                  <option key={scan.id} value={scan.id}>
                    {scan.title} · {formatDate(scan.scannedOn)}
                    {scan.withdrawn ? ' · Withdrawn' : ''}
                  </option>
                ))}
              </select>
            </label>
            {comparable.length > 0 && (
              <label className="flex min-w-0 items-center gap-2 text-sm text-neutral-400">
                Compare with
                <select
                  value={comparing?.id ?? ''}
                  onChange={(event) => setCompare(event.target.value)}
                  className="h-9 min-w-0 max-w-56 rounded-md border border-white/20 bg-neutral-950 px-2 text-sm text-white outline-white focus-visible:outline-2"
                >
                  <option value="">Nothing</option>
                  {comparable.map((scan) => (
                    <option key={scan.id} value={scan.id}>
                      {scan.title} · {formatDate(scan.scannedOn)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {comparing && (
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={sync} onChange={(event) => setSync(event.target.checked)} className="size-4 accent-white" />
                Sync views
              </label>
            )}
          </div>
        )}

        {scans.isPending ? (
          <p className="appear-late grid flex-1 place-items-center text-sm text-neutral-400">Loading the scans…</p>
        ) : uploading ? (
          <p className="grid flex-1 place-items-center px-6 text-center text-sm text-neutral-400">The new scan opens here once it is uploaded.</p>
        ) : selected ? (
          <div className={`flex min-h-0 flex-1 ${comparing ? 'flex-col gap-px lg:flex-row' : ''}`}>
            <ScanStage key={selected.id} patientId={id} scan={selected} isAdmin={isAdmin} caption={Boolean(comparing)} onViewer={setViewerA} hint={!marking && !(selected.pinCount > 0 && !comparing)}>
              {comparing
                ? undefined
                : (layer) => (
                    <ScanTeeth
                      patientId={id}
                      scan={selected}
                      layer={layer}
                      chart={chart.data}
                      selected={tooth}
                      onSelect={pickTooth}
                      canMark={canMark}
                      marking={marking}
                      onMarkingChange={setMarking}
                      panel={panelSlot}
                    />
                  )}
            </ScanStage>
            {comparing && <ScanStage key={comparing.id} patientId={id} scan={comparing} isAdmin={isAdmin} caption onViewer={setViewerB} />}
          </div>
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div className="max-w-sm">
              <CubeIcon className="mx-auto size-8 text-neutral-500" />
              <h2 className="mt-3 text-lg font-semibold">No 3D scans yet</h2>
              <p className="mt-1.5 text-sm/6 text-neutral-300">
                Upload the file your intraoral scanner exported (STL, PLY or OBJ) and it opens here in 3D, so you can turn it, zoom in and compare visits.
              </p>
              {canWrite ? (
                <button type="button" onClick={() => navigate(`/app/patients/${id}/scans?upload=1`)} className={`${buttonOnDark} mt-4 h-10 px-5 text-sm`}>
                  <UploadIcon className="size-4" /> Upload scan
                </button>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">Dentists and admins add scans.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <aside aria-label="Scans" className="min-w-0 bg-white lg:h-full lg:w-[26rem] lg:shrink-0 lg:overflow-y-auto">
        {uploading ? (
          <UploadPanel patientId={id} onClose={() => navigate(`/app/patients/${id}/scans${selected ? `/${selected.id}` : ''}`, { replace: true })} />
        ) : marking ? (
          <div ref={setPanelSlot} />
        ) : tooth && chart.data && patient.data ? (
          <div className="px-5 py-5 sm:px-6">
            <ToothHistory
              key={tooth}
              patientId={id}
              chart={chart.data}
              tooth={tooth}
              onSelect={pickTooth}
              canWrite={user.role === 'DENTIST' || isAdmin}
              archived={Boolean(patient.data.archivedAt)}
              backLabel="Back to the scan"
            />
          </div>
        ) : (
          <PanelBody patientId={id} items={items} selectedId={selected?.id ?? null} search={search} canWrite={canWrite} loading={scans.isPending} onMarkTeeth={canMark ? markTeeth : undefined} />
        )}
      </aside>
    </div>
  )
}

function PanelBody({ patientId, items, selectedId, search, canWrite, loading, onMarkTeeth }: { patientId: string; items: ReturnType<typeof useScans>['data'] & object; selectedId: string | null; search: string; canWrite: boolean; loading: boolean; onMarkTeeth?: () => void }) {
  const selected = useMemo(() => items.find((s) => s.id === selectedId) ?? null, [items, selectedId])
  if (loading) {
    return (
      <div className="p-6" aria-busy="true">
        <div className="h-6 w-32 rounded bg-neutral-100" />
        <div className="mt-6 h-40 rounded bg-neutral-100" />
      </div>
    )
  }
  return (
    <>
      {items.length > 0 && (
        <div className="hidden lg:block">
          <h2 className="px-6 pt-5 pb-2 text-lg font-semibold">Scans</h2>
          <div className="max-h-72 overflow-y-auto">
            <ScanList patientId={patientId} scans={items} selectedId={selectedId} search={search} />
          </div>
        </div>
      )}
      {selected && <ScanDetails key={selected.id} patientId={patientId} scan={selected} canWithdraw={canWrite} onMarkTeeth={onMarkTeeth} />}
      <p className="px-5 py-5 text-sm/6 text-neutral-600 lg:px-6">Scan files are patient health data. Only staff can open them, and every time a scan is opened it is logged.</p>
    </>
  )
}
