// Text box styles, shared so every form looks and behaves the same.

const base =
  'w-full rounded-md border bg-white px-3 text-neutral-950 placeholder:text-neutral-500 focus:ring-3 focus:ring-neutral-950/10 focus:outline-none'

/** A normal text box, 44px tall. */
export const inputClass = `${base} h-11 border-neutral-300 hover:border-neutral-400 focus:border-neutral-950`

/** A text box whose value the server refused: a heavier ink border, no red (see DESIGN.md). */
export const inputErrorClass = `${base} h-11 border-2 border-neutral-950`

/** A multi-line text box, such as an address. */
export const textareaClass = `${base} min-h-24 border-neutral-300 py-2.5 hover:border-neutral-400 focus:border-neutral-950`

export const textareaErrorClass = `${base} min-h-24 border-2 border-neutral-950 py-2.5`
