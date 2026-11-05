import { ToothPanel } from './features/dental-chart/components/ToothPanel'
import { MOCK_CHART } from './features/dental-chart/model/mockChart'
import { useChartStore } from './features/dental-chart/store'
import { DentalChart3D } from './features/dental-chart/three/DentalChart3D'

export default function App() {
  const selected = useChartStore((s) => s.selected)
  const select = useChartStore((s) => s.select)

  return (
    <div className="flex h-full bg-slate-100">
      <main className="relative min-w-0 flex-1 bg-[radial-gradient(circle_at_50%_48%,#1f2d44_0%,#0a101d_78%)]">
        <DentalChart3D toothStates={MOCK_CHART} selected={selected} onSelect={select} />
      </main>
      <ToothPanel selected={selected} toothStates={MOCK_CHART} />
    </div>
  )
}
