import { ToothPanel } from './features/dental-chart/components/ToothPanel'
import { MOCK_CHART } from './features/dental-chart/model/mockChart'
import { useChartStore } from './features/dental-chart/store'
import { DentalChart3D } from './features/dental-chart/three/DentalChart3D'
import { useDocumentTitle } from './lib/useDocumentTitle'

// The 3D chart with made-up data. It's loaded separately because it's most of the app's
// download. Charts get linked to real patients in a later step.
export default function Workspace() {
  useDocumentTitle('Sample chart')
  const selected = useChartStore((s) => s.selected)
  const select = useChartStore((s) => s.select)

  return (
    <div className="flex h-full bg-neutral-100">
      <main className="relative min-w-0 flex-1 bg-[radial-gradient(circle_at_50%_48%,#2b2b2b_0%,#0a0a0a_78%)]">
        <p className="absolute top-4 left-4 z-10 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-950">
          Sample data. Charts aren’t linked to patients yet.
        </p>
        <DentalChart3D toothStates={MOCK_CHART} selected={selected} onSelect={select} />
      </main>
      <ToothPanel selected={selected} toothStates={MOCK_CHART} />
    </div>
  )
}
