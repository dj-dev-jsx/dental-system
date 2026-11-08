import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon } from '../../../components/icons'
import { MiniMonth } from '../../../components/MiniMonth'

/**
 * The calendar's title, which is also the way to jump to any day: clicking it drops a small
 * month under it, as in a desktop calendar.
 */
export function TitlePicker({ title, date, onPick }: { title: string; date: string; onPick: (date: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    // Start on the shown day, so the arrow keys and Tab begin from there.
    root.current?.querySelector<HTMLButtonElement>('[role="dialog"] [aria-current="date"]')?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    button.current?.focus()
  }

  return (
    <div ref={root} className="relative max-w-full min-w-0 shrink-0">
      <h1 className="min-w-0 text-2xl font-bold tracking-[-0.02em]" aria-live="polite">
        <button
          ref={button}
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={id}
          aria-haspopup="dialog"
          // Pulled left so the text lines up with the page edge; the max width gives the pull back.
          className="-ml-2 inline-flex max-w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-md px-2 py-0.5 text-left outline-neutral-950 transition-colors duration-150 hover:bg-neutral-100 focus-visible:outline-2"
        >
          <span className="truncate">{title}</span>
          <ChevronDownIcon className={`size-5 shrink-0 text-neutral-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
          <span className="sr-only">, choose a day</span>
        </button>
      </h1>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="Choose a day"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            }
          }}
          className="drop-in absolute top-full left-0 z-40 mt-2 w-[17rem] rounded-md border border-neutral-950 bg-white py-3"
        >
          <MiniMonth
            tone="light"
            selected={date}
            onPick={(day) => {
              onPick(day)
              close()
            }}
          />
        </div>
      )}
    </div>
  )
}
