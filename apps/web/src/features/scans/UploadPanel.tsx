import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { inputClass, inputErrorClass, textareaClass } from '../../components/forms'
import { UploadIcon } from '../../components/icons'
import { todayInManila } from '../../lib/format'
import { addScanToCache, uploadScan } from './api'
import { scanErrorMessage } from './errors'
import { formatBytes, formatOf, MAX_SCAN_BYTES } from './types'

const SUGGESTIONS = ['Upper arch', 'Lower arch', 'Both arches', 'Bite']

/** What is wrong with a chosen file, checked before anything is sent. */
function fileProblem(file: File): string | null {
  if (!formatOf(file.name)) return 'Only STL, PLY and OBJ files can be uploaded. Export the scan from the scanner in one of those formats.'
  if (file.size === 0) return 'This file is empty. Export the scan again.'
  if (file.size > MAX_SCAN_BYTES) return `This file is ${formatBytes(file.size)}, more than the 150 MB limit. Export the scan at a lower resolution.`
  return null
}

/** Adds a scan to the patient: choose or drop the file, name it, send it with progress. */
export function UploadPanel({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [scannedOn, setScannedOn] = useState(todayInManila)
  const [dateError, setDateError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const today = todayInManila()
  const sending = progress !== null

  // Leaving the page cancels an upload in progress.
  useEffect(() => () => abort.current?.abort(), [])

  function choose(chosen: File | undefined) {
    if (!chosen) return
    const problem = fileProblem(chosen)
    setError(null)
    setFileError(problem)
    setFile(problem ? null : chosen)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files[0])
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    const titleProblem = trimmed ? (trimmed.length > 100 ? 'Use 100 characters or fewer.' : null) : 'Give the scan a title, such as “Upper arch”.'
    const dateProblem = !scannedOn ? 'Choose the day it was scanned.' : scannedOn > today ? 'The scan date can’t be in the future.' : null
    const missingFile = file ? null : 'Choose the scan file first.'
    setTitleError(titleProblem)
    setDateError(dateProblem)
    setFileError(missingFile ?? fileError)
    if (titleProblem || dateProblem || missingFile || !file) return

    const controller = new AbortController()
    abort.current = controller
    setError(null)
    setProgress({ sent: 0, total: file.size })
    try {
      const scan = await uploadScan(patientId, { file, title: trimmed, note: note.trim() || undefined, scannedOn }, (sent, total) => setProgress({ sent, total }), controller.signal)
      addScanToCache(client, patientId, scan)
      navigate(`/app/patients/${patientId}/scans/${scan.id}`, { replace: true })
    } catch (caught) {
      if (controller.signal.aborted) {
        setProgress(null)
        return
      }
      setProgress(null)
      setError(scanErrorMessage(caught))
    }
  }

  const percent = progress ? Math.round((progress.sent / Math.max(progress.total, 1)) * 100) : 0
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="px-5 py-5 lg:px-6" aria-label="Upload a scan">
      <h2 className="text-xl font-bold tracking-[-0.02em]">Upload scan</h2>
      <p className="mt-1 text-sm/6 text-neutral-600">The 3D file your intraoral scanner exported: STL, PLY or OBJ, up to 150 MB.</p>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 rounded-md border border-dashed px-4 py-6 text-center transition-colors duration-150 ${dragging ? 'border-neutral-950 bg-neutral-100' : fileError ? 'border-2 border-neutral-950' : 'border-neutral-400'}`}
      >
        <input ref={input} id="scan-file" type="file" accept=".stl,.ply,.obj" disabled={sending} className="sr-only" onChange={(event) => choose(event.target.files?.[0])} aria-describedby={fileError ? 'scan-file-error' : undefined} />
        {file ? (
          <div>
            <p className="font-semibold break-all">{file.name}</p>
            <p className="mt-0.5 text-sm text-neutral-600">
              {formatOf(file.name)} · <span className="tabular-nums">{formatBytes(file.size)}</span>
            </p>
            {!sending && (
              <button type="button" onClick={() => input.current?.click()} className="mt-2 text-sm font-semibold underline underline-offset-3 hover:text-neutral-700">
                Choose a different file
              </button>
            )}
          </div>
        ) : (
          <div>
            <UploadIcon className="mx-auto size-6 text-neutral-600" />
            <p className="mt-2 text-sm text-neutral-700">Drop the scan file here, or</p>
            <button type="button" onClick={() => input.current?.click()} className={`${buttonOutline} mt-2 h-9 px-4 text-sm`}>
              Choose file
            </button>
          </div>
        )}
      </div>
      {fileError && (
        <p id="scan-file-error" className="mt-1.5 text-sm font-medium">
          {fileError}
        </p>
      )}

      <div className="mt-5">
        <label htmlFor="scan-title" className="block text-sm font-semibold">
          Title <span className="font-normal text-neutral-600">Required</span>
        </label>
        <input
          id="scan-title"
          className={`${titleError ? inputErrorClass : inputClass} mt-1`}
          value={title}
          maxLength={100}
          disabled={sending}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? 'scan-title-error' : undefined}
          onChange={(event) => {
            setTitle(event.target.value)
            setTitleError(null)
          }}
        />
        {titleError && (
          <p id="scan-title-error" className="mt-1 text-sm font-medium">
            {titleError}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Title suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={sending}
              onClick={() => {
                setTitle(suggestion)
                setTitleError(null)
              }}
              className="h-8 rounded-md border border-neutral-300 px-2.5 text-sm font-medium outline-neutral-950 hover:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:text-neutral-500"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="scan-date" className="block text-sm font-semibold">
          Scan date
        </label>
        <input
          id="scan-date"
          type="date"
          max={today}
          value={scannedOn}
          disabled={sending}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={dateError ? 'scan-date-error' : undefined}
          onChange={(event) => {
            setScannedOn(event.target.value)
            setDateError(null)
          }}
          className={`${dateError ? inputErrorClass : inputClass} mt-1 sm:w-56`}
        />
        {dateError && (
          <p id="scan-date-error" className="mt-1 text-sm font-medium">
            {dateError}
          </p>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor="scan-note" className="block text-sm font-semibold">
          Note <span className="font-normal text-neutral-600">Optional</span>
        </label>
        <textarea id="scan-note" className={`${textareaClass} mt-1 min-h-20`} rows={3} maxLength={500} value={note} disabled={sending} onChange={(event) => setNote(event.target.value)} />
        <p className="mt-1 text-xs text-neutral-600 tabular-nums">{note.length} of 500</p>
      </div>

      <p className="mt-5 text-sm/6 text-neutral-600">Scan files are patient health data. Only staff can open them, and every time a scan is opened it is logged.</p>

      {error && <ErrorBox className="mt-4">{error}</ErrorBox>}

      {progress && (
        <div className="mt-4" role="status">
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Upload progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-neutral-950" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-sm text-neutral-600 tabular-nums">
            {percent >= 100 ? 'Checking the file…' : `Uploading ${formatBytes(progress.sent)} of ${formatBytes(progress.total)}`}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {sending ? (
          <button type="button" onClick={() => abort.current?.abort()} className={`${buttonOutline} h-10 px-5`}>
            Cancel upload
          </button>
        ) : (
          <>
            <button type="submit" className={`${buttonOnLight} h-10 px-5`}>
              Upload scan
            </button>
            <button type="button" onClick={onClose} className={`${buttonOutline} h-10 px-4`}>
              Cancel
            </button>
          </>
        )}
      </div>
    </form>
  )
}
