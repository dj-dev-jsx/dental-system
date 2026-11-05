import { FDI_CODES, type FdiCode } from './fdi'
import type { ToothStatus } from './status'

export type ChartState = Record<FdiCode, ToothStatus>

// Temporary mock data. Later this comes from GET /patients/:id/chart.
const overrides: Partial<ChartState> = {
  '16': 'decayed',
  '26': 'filled',
  '36': 'root_canal',
  '46': 'crown',
  '11': 'crown',
  '24': 'filled',
  '38': 'missing',
  '48': 'extracted',
  '35': 'implant',
}

export const MOCK_CHART: ChartState = Object.fromEntries(
  FDI_CODES.map((code) => [code, overrides[code] ?? 'healthy']),
) as ChartState
