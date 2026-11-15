import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { CubeIcon, UploadIcon } from '../../components/icons'
import { RecordSection } from '../patients/RecordSection'
import { formatDate } from '../../lib/format'
import { useScans } from './api'

/** The patient record's entry to the 3D scans: the latest one, how many, and the way in. */
export function ScansSection({ patientId, canUpload }: { patientId: string; canUpload: boolean }) {
  const scans = useScans(patientId)
  const items = (scans.data ?? []).filter((s) => !s.withdrawn)
  const latest = items[0]
  return (
    <RecordSection title="3D scans">
      <div className="py-4">
        {scans.isPending ? (
          <div className="h-5 w-56 rounded bg-neutral-100" aria-busy="true" />
        ) : scans.isError ? (
          <p className="text-sm text-neutral-600">The scans didn’t load. Open the page again to retry.</p>
        ) : latest ? (
          <>
            <p className="font-semibold">{latest.title}</p>
            <p className="mt-0.5 text-sm text-neutral-600">
              Scanned {formatDate(latest.scannedOn)} · {items.length} {items.length === 1 ? 'scan' : 'scans'}
              {scans.data!.length > items.length && ` · ${scans.data!.length - items.length} withdrawn`}
            </p>
          </>
        ) : (
          <p className="max-w-prose text-sm/6 text-neutral-600">
            <CubeIcon className="mr-1.5 -mt-0.5 inline size-4" />
            No 3D scans yet. Upload the file from the intraoral scanner (STL, PLY or OBJ) to look at it in 3D and compare visits.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {items.length > 0 && (
            <Link to={`/app/patients/${patientId}/scans`} className={`${buttonOnLight} h-9 px-4 text-sm`}>
              <CubeIcon className="size-4" /> Open scans
            </Link>
          )}
          {canUpload && (
            <Link to={`/app/patients/${patientId}/scans?upload=1`} className={`${items.length > 0 ? buttonOutline : buttonOnLight} h-9 px-4 text-sm`}>
              <UploadIcon className="size-4" /> Upload scan
            </Link>
          )}
        </div>
      </div>
    </RecordSection>
  )
}
