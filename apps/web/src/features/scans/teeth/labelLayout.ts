// Laying out tooth-number discs so they never overlap: where teeth are close together on screen
// (seen end-on, or crowded), a disc moves outward from the arch and a leader line points back
// at its tooth.

export type LabelIn = { key: string; x: number; y: number }
export type LabelOut = { key: string; x: number; y: number; ax: number; ay: number; moved: boolean }

/**
 * Places each disc (`radius` px) at its point or, if that is taken, a little further out from the
 * middle of all the points, trying a few angles either side. Points are laid out in the order
 * given (arch order reads naturally). `gap` is the space kept between discs.
 */
export function layoutLabels(points: LabelIn[], radius: number, gap = 3): LabelOut[] {
  if (points.length === 0) return []
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  const min = (2 * radius + gap) ** 2
  const placed: LabelOut[] = []
  const free = (x: number, y: number) => placed.every((q) => (q.x - x) ** 2 + (q.y - y) ** 2 >= min)
  for (const p of points) {
    let best: [number, number] = [p.x, p.y]
    if (!free(p.x, p.y)) {
      const base = Math.atan2(p.y - cy, p.x - cx) || -Math.PI / 2
      let found = false
      for (let step = 1; step <= 8 && !found; step++) {
        // Far enough out that the leader line shows past both discs.
        const distance = 2 * radius + gap + 6 + (step - 1) * (radius + gap)
        for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1]) {
          const x = p.x + Math.cos(base + turn) * distance
          const y = p.y + Math.sin(base + turn) * distance
          if (free(x, y)) {
            best = [x, y]
            found = true
            break
          }
        }
      }
    }
    placed.push({ key: p.key, x: best[0], y: best[1], ax: p.x, ay: p.y, moved: best[0] !== p.x || best[1] !== p.y })
  }
  return placed
}
