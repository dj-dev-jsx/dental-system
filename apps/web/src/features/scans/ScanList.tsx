import { Link } from 'react-router'
import { Pill } from '../../components/Table'
import { formatDate } from '../../lib/format'
import { formatBytes, type Scan } from './types'

/** The patient's scans, newest first, each a link that opens it on the stage. */
export function ScanList({ patientId, scans, selectedId, search }: { patientId: string; scans: Scan[]; selectedId: string | null; search: string }) {
  return (
    <ul aria-label="Scans" className="divide-y divide-neutral-200 border-y border-neutral-200">
      {scans.map((scan) => {
        const current = scan.id === selectedId
        return (
          <li key={scan.id}>
            <Link
              to={`/app/patients/${patientId}/scans/${scan.id}${search}`}
              aria-current={current ? 'true' : undefined}
              className={`block px-5 py-3 outline-neutral-950 focus-visible:outline-2 focus-visible:-outline-offset-2 lg:px-6 ${current ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`min-w-0 break-words ${current ? 'font-bold' : 'font-semibold'} ${scan.withdrawn ? 'text-neutral-500' : ''}`}>{scan.title}</span>
                {scan.withdrawn && <Pill>Withdrawn</Pill>}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
                <span>{formatDate(scan.scannedOn)}</span>
                <Pill tone="muted">{scan.format}</Pill>
                <span className="tabular-nums">{formatBytes(scan.sizeBytes)}</span>
              </span>
              <span className="mt-0.5 block text-sm text-neutral-500">
                Uploaded by {scan.uploadedBy.firstName} {scan.uploadedBy.lastName}
              </span>
              <span className="mt-0.5 block text-sm text-neutral-500">
                {scan.pinCount > 0 ? <>Teeth checked: <span className="tabular-nums">{scan.pinCount}</span></> : 'Teeth not checked yet'}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
