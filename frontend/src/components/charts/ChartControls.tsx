import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { EquipmentGroup, Parameter, PlotType } from '@/types'
import { PLOT_TYPES } from '@/types'

interface ChartControlsProps {
  cropId: string | null
  selectedParameter1: string
  selectedParameter2: string
  plotType: PlotType
  timeRange: string
  onParameter1Change: (param: string) => void
  onParameter2Change: (param: string) => void
  onPlotTypeChange: (type: PlotType) => void
  onTimeRangeChange: (range: string) => void
}

const TIME_RANGES = [
  { value: '1d', label: '1 Day' },
  { value: '7d', label: '1 Week' },
  { value: '30d', label: '1 Month' },
  { value: 'all', label: 'All Data' },
]

export default function ChartControls({
  cropId,
  selectedParameter1,
  selectedParameter2,
  plotType,
  timeRange,
  onParameter1Change,
  onParameter2Change,
  onPlotTypeChange,
  onTimeRangeChange,
}: ChartControlsProps) {
  const [equipmentGroups, setEquipmentGroups] = useState<EquipmentGroup[]>([])
  const [parameters, setParameters] = useState<Parameter[]>([])
  const [selectedEquipmentGroup, setSelectedEquipmentGroup] = useState<string>('all')
  const [loading, setLoading] = useState(false)

  // Load equipment groups and parameters when cropId changes
  useEffect(() => {
    if (!cropId) {
      setEquipmentGroups([])
      setParameters([])
      return
    }

    setLoading(true)
    Promise.all([
      api.get(`/api/sites/equipment-groups?crop_id=${cropId}`),
      api.get(`/api/sites/parameters?crop_id=${cropId}`),
    ])
      .then(([eqRes, paramRes]) => {
        setEquipmentGroups(eqRes.data)
        setParameters(paramRes.data)
        // Reset equipment group selection
        setSelectedEquipmentGroup('all')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [cropId])

  // Filter parameters by selected equipment group
  const filteredParameters = selectedEquipmentGroup === 'all'
    ? parameters
    : parameters.filter(p => p.equipment_group_id === selectedEquipmentGroup)

  // Check if we need second parameter based on plot type
  const needsSecondParam = ['LP-2PT', 'SP-2PT', 'SP-PP'].includes(plotType)

  return (
    <div className="space-y-4">
      {/* Equipment Group Dropdown */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          Equipment Group
        </label>
        <div className="relative">
          <select
            value={selectedEquipmentGroup}
            onChange={(e) => setSelectedEquipmentGroup(e.target.value)}
            disabled={loading || equipmentGroups.length === 0}
            className={cn(
              'w-full px-3 py-2 pr-10 rounded-lg border border-border bg-card',
              'text-sm appearance-none cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-primary/50',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <option value="all">All Equipment</option>
            {equipmentGroups.map(eq => (
              <option key={eq.id} value={eq.id}>{eq.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Parameter 1 Dropdown */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          Parameter {needsSecondParam ? '1' : ''}
        </label>
        <div className="relative">
          <select
            value={selectedParameter1}
            onChange={(e) => onParameter1Change(e.target.value)}
            disabled={loading || filteredParameters.length === 0}
            className={cn(
              'w-full px-3 py-2 pr-10 rounded-lg border border-border bg-card',
              'text-sm appearance-none cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-primary/50',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <option value="">Select parameter...</option>
            {filteredParameters.map(p => (
              <option key={p.id} value={p.name}>
                {p.display_name || p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Parameter 2 Dropdown (conditional) */}
      {needsSecondParam && (
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Parameter 2
          </label>
          <div className="relative">
            <select
              value={selectedParameter2}
              onChange={(e) => onParameter2Change(e.target.value)}
              disabled={loading || filteredParameters.length === 0}
              className={cn(
                'w-full px-3 py-2 pr-10 rounded-lg border border-border bg-card',
                'text-sm appearance-none cursor-pointer',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <option value="">Select parameter...</option>
              {filteredParameters.map(p => (
                <option key={p.id} value={p.name}>
                  {p.display_name || p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      )}

      {/* Plot Type Dropdown */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          Plot Type
        </label>
        <div className="relative">
          <select
            value={plotType}
            onChange={(e) => onPlotTypeChange(e.target.value as PlotType)}
            className={cn(
              'w-full px-3 py-2 pr-10 rounded-lg border border-border bg-card',
              'text-sm appearance-none cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-primary/50'
            )}
          >
            {PLOT_TYPES.map(pt => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Time Range Buttons */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          Time Range
        </label>
        <div className="flex flex-wrap gap-2">
          {TIME_RANGES.map(range => (
            <button
              key={range.value}
              onClick={() => onTimeRangeChange(range.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                timeRange === range.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
