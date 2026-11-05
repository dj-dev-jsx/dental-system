import { create } from 'zustand'
import type { FdiCode } from './model/fdi'

// UI-only state shared by the 3D canvas and the side panel.
// Server data (tooth statuses, history) will live in TanStack Query instead.
type ChartUiState = {
  selected: FdiCode | null
  select: (code: FdiCode | null) => void
}

export const useChartStore = create<ChartUiState>((set) => ({
  selected: null,
  select: (code) => set({ selected: code }),
}))
