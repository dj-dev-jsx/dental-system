// FDI World Dental Federation notation (ISO 3950).
// Two digits: the first is the quadrant, the second is the tooth position
// counted from the midline (1 = central incisor ... 8 = third molar).
//
//   Quadrant 1 = upper right     Quadrant 2 = upper left
//   Quadrant 4 = lower right     Quadrant 3 = lower left
//   ("right" and "left" are the PATIENT's right and left)

export type Quadrant = 1 | 2 | 3 | 4
export type Position = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type FdiCode = `${Quadrant}${Position}`

const QUADRANTS: Quadrant[] = [1, 2, 3, 4]
const POSITIONS: Position[] = [1, 2, 3, 4, 5, 6, 7, 8]

/** All 32 permanent teeth, in order 11..18, 21..28, 31..38, 41..48. */
export const FDI_CODES: FdiCode[] = QUADRANTS.flatMap((q) =>
  POSITIONS.map((p) => `${q}${p}` as FdiCode),
)

export function parseFdi(code: FdiCode): { quadrant: Quadrant; position: Position } {
  return {
    quadrant: Number(code[0]) as Quadrant,
    position: Number(code[1]) as Position,
  }
}

const QUADRANT_NAMES: Record<Quadrant, string> = {
  1: 'Upper right',
  2: 'Upper left',
  3: 'Lower left',
  4: 'Lower right',
}

const POSITION_NAMES: Record<Position, string> = {
  1: 'central incisor',
  2: 'lateral incisor',
  3: 'canine',
  4: 'first premolar',
  5: 'second premolar',
  6: 'first molar',
  7: 'second molar',
  8: 'third molar (wisdom)',
}

export function toothName(code: FdiCode): string {
  const { quadrant, position } = parseFdi(code)
  return `${QUADRANT_NAMES[quadrant]} ${POSITION_NAMES[position]}`
}

export function isFdiCode(value: string): value is FdiCode {
  return (FDI_CODES as string[]).includes(value)
}
