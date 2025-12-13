export interface User {
  id: string
  email: string
  full_name: string
  is_admin: boolean
  is_active: boolean
  created_at: string
  last_login: string | null
  groups: string[]
}

export interface Crop {
  id: string
  name: string
  display_name: string
  color: string
}

export interface Site {
  id: string
  site_code: string
  name: string
  crop_id: string
  crop_name: string | null
  latitude: number
  longitude: number
  is_active: boolean
}

export interface EquipmentGroup {
  id: string
  name: string
  crop_id: string
}

export interface Parameter {
  id: string
  name: string
  display_name: string | null
  unit: string | null
  equipment_group_id: string | null
  equipment_group_name: string | null
  min_range: number | null
  max_range: number | null
}

export interface SensorDataPoint {
  timestamp: string
  site_code: string
  values: Record<string, number | null>
}

export interface SensorDataResponse {
  data: SensorDataPoint[]
  sites: string[]
  parameters: string[]
  count: number
}

export type PlotType = 'LP-PT' | 'LP-2PT' | 'SP-PT' | 'SP-2PT' | 'SP-PP'

export interface PlotTypeOption {
  value: PlotType
  label: string
  description: string
}

export const PLOT_TYPES: PlotTypeOption[] = [
  { value: 'LP-PT', label: 'Line: Param vs Time', description: 'Single parameter over time' },
  { value: 'LP-2PT', label: 'Line: 2 Params vs Time', description: 'Two parameters over time' },
  { value: 'SP-PT', label: 'Scatter: Param vs Time', description: 'Single parameter scatter' },
  { value: 'SP-2PT', label: 'Scatter: 2 Params vs Time', description: 'Two parameters scatter' },
  { value: 'SP-PP', label: 'Scatter: Param vs Param', description: 'Parameter correlation' },
]
