import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { useThemeStore } from '@/stores/themeStore'
import type { SensorDataPoint, PlotType } from '@/types'
import type { Data, Layout, Config } from 'plotly.js'

interface SensorChartProps {
  data: SensorDataPoint[]
  sites: string[]
  siteColors?: Record<string, string>
  parameter1: string
  parameter2?: string
  plotType: PlotType
  title?: string
  height?: number
  showRangeSlider?: boolean
}

// Color palette for dynamically coloring sites
const colorPalette = [
  '#3B82F6', '#8B5CF6', '#EF4444', '#22C55E', '#F59E0B',
  '#2563EB', '#7C3AED', '#DC2626', '#16A34A', '#D97706',
  '#1D4ED8', '#6D28D9', '#B91C1C', '#15803D', '#B45309',
  '#1E40AF', '#5B21B6', '#991B1B', '#166534', '#92400E',
]

// Generate colors for sites dynamically based on order
const generateSiteColors = (sites: string[]): Record<string, string> => {
  const colors: Record<string, string> = {}
  sites.forEach((site, index) => {
    colors[site] = colorPalette[index % colorPalette.length]
  })
  return colors
}

export default function SensorChart({
  data,
  sites,
  siteColors,
  parameter1,
  parameter2,
  plotType,
  title,
  height = 400,
  showRangeSlider = true,
}: SensorChartProps) {
  // Generate colors dynamically if not provided
  const effectiveSiteColors = siteColors || generateSiteColors(sites)
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  // Group data by site
  const siteData = useMemo(() => {
    const grouped: Record<string, SensorDataPoint[]> = {}
    for (const point of data) {
      if (!grouped[point.site_code]) {
        grouped[point.site_code] = []
      }
      grouped[point.site_code].push(point)
    }
    // Sort each site's data by timestamp
    for (const site in grouped) {
      grouped[site].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }
    return grouped
  }, [data])

  // Build plotly traces based on plot type
  const traces = useMemo((): Data[] => {
    const result: Data[] = []

    for (const site of sites) {
      const points = siteData[site] || []
      if (points.length === 0) continue

      const color = effectiveSiteColors[site] || '#888888'
      const timestamps = points.map(p => p.timestamp)
      const values1 = points.map(p => p.values[parameter1])
      const values2 = parameter2 ? points.map(p => p.values[parameter2]) : []

      const baseTrace = {
        name: site,
        marker: { color },
        line: { color, width: 2 },
        hovertemplate: '%{y:.2f}<extra>%{fullData.name}</extra>',
      }

      switch (plotType) {
        case 'LP-PT': // Line Plot: Parameter vs Time
          result.push({
            ...baseTrace,
            x: timestamps,
            y: values1,
            type: 'scatter',
            mode: 'lines',
          } as Data)
          break

        case 'LP-2PT': // Line Plot: Two Parameters vs Time
          result.push({
            ...baseTrace,
            x: timestamps,
            y: values1,
            type: 'scatter',
            mode: 'lines',
            name: `${site} - ${parameter1}`,
          } as Data)
          if (parameter2) {
            result.push({
              ...baseTrace,
              x: timestamps,
              y: values2,
              type: 'scatter',
              mode: 'lines',
              name: `${site} - ${parameter2}`,
              yaxis: 'y2',
              line: { color, width: 2, dash: 'dot' },
            } as Data)
          }
          break

        case 'SP-PT': // Scatter Plot: Parameter vs Time
          result.push({
            ...baseTrace,
            x: timestamps,
            y: values1,
            type: 'scatter',
            mode: 'markers',
            marker: { color, size: 6 },
          } as Data)
          break

        case 'SP-2PT': // Scatter Plot: Two Parameters vs Time
          result.push({
            ...baseTrace,
            x: timestamps,
            y: values1,
            type: 'scatter',
            mode: 'markers',
            name: `${site} - ${parameter1}`,
            marker: { color, size: 6 },
          } as Data)
          if (parameter2) {
            result.push({
              ...baseTrace,
              x: timestamps,
              y: values2,
              type: 'scatter',
              mode: 'markers',
              name: `${site} - ${parameter2}`,
              yaxis: 'y2',
              marker: { color, size: 6, symbol: 'diamond' },
            } as Data)
          }
          break

        case 'SP-PP': // Scatter Plot: Parameter vs Parameter
          if (parameter2) {
            result.push({
              ...baseTrace,
              x: values1,
              y: values2,
              type: 'scatter',
              mode: 'markers',
              marker: { color, size: 6 },
              hovertemplate: `${parameter1}: %{x:.2f}<br>${parameter2}: %{y:.2f}<extra>%{fullData.name}</extra>`,
            } as Data)
          }
          break
      }
    }

    return result
  }, [siteData, sites, effectiveSiteColors, parameter1, parameter2, plotType])

  // Build layout
  const layout = useMemo((): Partial<Layout> => {
    const colors = {
      paper: isDark ? '#1e293b' : '#ffffff',
      plot: isDark ? '#1e293b' : '#ffffff',
      text: isDark ? '#f1f5f9' : '#1e293b',
      grid: isDark ? '#334155' : '#e2e8f0',
      rangeslider: isDark ? '#0f172a' : '#f8fafc',
    }

    // Only show rangeslider for time-based charts (not SP-PP)
    const isTimeBased = plotType !== 'SP-PP'
    const rangeSliderHeight = showRangeSlider && isTimeBased ? 80 : 0

    const baseLayout: Partial<Layout> = {
      autosize: true,
      height: height + rangeSliderHeight,
      margin: { l: 60, r: 60, t: 40, b: showRangeSlider && isTimeBased ? 20 : 60 },
      paper_bgcolor: colors.paper,
      plot_bgcolor: colors.plot,
      font: { color: colors.text, family: 'Inter, system-ui, sans-serif' },
      title: title ? { text: title, font: { size: 16 } } : undefined,
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'right',
        x: 1,
      },
      hovermode: 'x unified',
      xaxis: {
        gridcolor: colors.grid,
        zerolinecolor: colors.grid,
        ...(showRangeSlider && isTimeBased ? {
          rangeslider: {
            visible: true,
            bgcolor: colors.rangeslider,
            bordercolor: colors.grid,
            thickness: 0.15,
          },
          type: 'date',
        } : {}),
      },
      yaxis: {
        gridcolor: colors.grid,
        zerolinecolor: colors.grid,
        title: { text: parameter1 },
      },
    }

    // Configure axes based on plot type
    if (plotType === 'SP-PP' && parameter2) {
      baseLayout.xaxis = {
        ...baseLayout.xaxis,
        title: { text: parameter1 },
      }
      baseLayout.yaxis = {
        ...baseLayout.yaxis,
        title: { text: parameter2 },
      }
    } else if (['LP-2PT', 'SP-2PT'].includes(plotType) && parameter2) {
      baseLayout.yaxis2 = {
        title: { text: parameter2 },
        overlaying: 'y',
        side: 'right',
        gridcolor: colors.grid,
        zerolinecolor: colors.grid,
      }
    }

    return baseLayout
  }, [isDark, height, title, parameter1, parameter2, plotType, showRangeSlider])

  // Plotly config
  const config: Partial<Config> = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted/30 rounded-lg border-2 border-dashed border-border"
        style={{ height }}
      >
        <div className="text-center text-muted-foreground">
          <p>No data available</p>
          <p className="text-sm">Select sites and parameters, then adjust the date range</p>
        </div>
      </div>
    )
  }

  return (
    <Plot
      data={traces}
      layout={layout}
      config={config}
      className="w-full"
      useResizeHandler
      style={{ width: '100%', height }}
    />
  )
}
