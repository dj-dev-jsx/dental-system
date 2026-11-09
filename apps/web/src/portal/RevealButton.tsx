import { EyeIcon, EyeOffIcon } from './icons'

// Kept in its own file so the shared sign-in screen can use it without the patient pages' code.

/** Show / Hide for a password box: an eye that fills the box's height, a full tap target. */
export function RevealButton({ shown, onToggle, controls }: { shown: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      aria-controls={controls}
      aria-label="Show password"
      title={shown ? 'Hide password' : 'Show password'}
      className="group absolute inset-y-0 right-0 flex w-12 items-center justify-center outline-none"
    >
      <span className="grid size-9 place-items-center rounded-lg text-neutral-600 outline-neutral-950 transition-colors group-hover:bg-neutral-100 group-hover:text-neutral-950 group-focus-visible:outline-2">
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </span>
    </button>
  )
}
