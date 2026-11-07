import { formatDate, manilaDate } from '../../../lib/format'
import { type ChartRecord, recordedByName, type ToothNow } from '../api'
import { type FdiCode, toothName } from '../model/fdi'
import { STATUS_LABELS, statusOf, surfaceList } from '../model/status'
import type { Anchor } from '../three/AnchorTracker'
import { Swatch } from './Swatch'

type Props = {
  tooth: FdiCode
  /** Where the tooth is on the stage, in pixels. */
  anchor: Anchor
  stage: { width: number; height: number }
  now: ToothNow | undefined
  /** The entry that set the tooth's current state. */
  latest: ChartRecord | undefined
}

const MARGIN = 20
const ELBOW = 44 // how far the line runs flat before it reaches the label

/**
 * A label at the side of the stage with a line drawn to the chosen tooth, like the callouts on
 * an annotated X-ray: the tooth's latest finding, without taking eyes off the model.
 * It's drawn over the 3D canvas, not in it, so it stays crisp and costs the scene nothing.
 */
export function ToothCallout({ tooth, anchor, stage, now, latest }: Props) {
  const width = 248
  const side = anchor.x < stage.width / 2 ? 'left' : 'right'
  const left = side === 'left' ? MARGIN : stage.width - MARGIN - width
  // Upper teeth get their label above them, lower teeth below.
  const upper = Number(tooth[0]) <= 2
  const wanted = upper ? anchor.y - 128 : anchor.y + 56
  const top = Math.min(Math.max(wanted, 16), stage.height - 140)

  // The line: from the tooth, slanting to an elbow, then flat into the label's top rule.
  const edge = side === 'left' ? left + width : left
  const elbow = side === 'left' ? edge + ELBOW : edge - ELBOW
  const path = `M ${anchor.x} ${anchor.y} L ${elbow} ${top} L ${edge} ${top}`

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      <svg className="absolute inset-0 size-full overflow-visible">
        <path key={tooth} d={path} pathLength={1} className="callout-line fill-none stroke-white/70" strokeWidth={1} />
        <circle cx={anchor.x} cy={anchor.y} r={7} className="fill-none stroke-white/50" strokeWidth={1} />
        <circle cx={anchor.x} cy={anchor.y} r={2.5} className="fill-white" />
      </svg>
      <div key={tooth} className="callout-label absolute border-t border-white/70 pt-2 text-white" style={{ left, top, width }}>
        <p className="flex items-baseline gap-2">
          <span className="text-2xl/7 font-bold tabular-nums">{tooth}</span>
          <span className="truncate text-xs text-neutral-400">{toothName(tooth)}</span>
        </p>
        {now ? (
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <Swatch condition={now.condition} onDark />
            <span className="truncate">
              {STATUS_LABELS[statusOf(now.condition)]}
              {now.surfaces.length > 0 && <span className="font-normal text-neutral-300"> · {surfaceList(now.surfaces)}</span>}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-400">Nothing recorded yet</p>
        )}
        {latest && (
          <p className="mt-0.5 truncate text-xs text-neutral-400">
            {formatDate(manilaDate(latest.recordedAt))} · {recordedByName(latest)}
          </p>
        )}
        {latest?.note && <p className="mt-1 line-clamp-2 text-xs text-neutral-300">{latest.note}</p>}
      </div>
    </div>
  )
}
