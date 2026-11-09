// Button styles, shared so every button in the app looks and behaves the same.
// They work on <button> and on <Link>. Add size or width classes where they're used.
const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2'

/** A white button, for black backgrounds and photos. */
export const buttonOnDark = `${base} bg-white text-neutral-950 outline-white hover:bg-neutral-200 active:bg-neutral-300`

/** A black button, for white backgrounds. */
export const buttonOnLight = `${base} bg-neutral-950 text-white outline-neutral-950 hover:bg-neutral-800 active:bg-neutral-700 disabled:cursor-wait disabled:bg-neutral-950/70`

/** A quiet outlined button, for white backgrounds. */
export const buttonOutline = `${base} border border-neutral-300 bg-white text-neutral-900 outline-neutral-950 hover:border-neutral-950 active:bg-neutral-100 disabled:cursor-wait disabled:text-neutral-500`

/**
 * A main action that can't be used yet, with the reason said beside it. Use with
 * aria-disabled (not disabled), so it stays focusable and its reason can be read out.
 */
export const buttonBlocked = `${base} cursor-not-allowed border border-neutral-300 bg-neutral-100 text-neutral-500 outline-neutral-950`
