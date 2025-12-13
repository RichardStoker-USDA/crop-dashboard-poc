import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LogOut, Sun, Moon, Menu, X,
  MapPin, Leaf, BarChart3, Settings, Loader2
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { cn, cropColors } from '@/lib/utils'
import api from '@/lib/api'
import SensorChart from '@/components/charts/SensorChart'
import ChartControls from '@/components/charts/ChartControls'
import SiteMap from '@/components/charts/SiteMap'
import { SkeletonChart, SkeletonMap, SkeletonStatsCard } from '@/components/ui/Skeleton'
import { toast } from '@/stores/toastStore'
import Footer from '@/components/ui/Footer'
import type { Site, Crop, SensorDataPoint, PlotType } from '@/types'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  // Data state
  const [sites, setSites] = useState<Site[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [selectedCrop, setSelectedCrop] = useState<string>('all')
  const [selectedSites, setSelectedSites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Chart state
  const [parameter1, setParameter1] = useState<string>('')
  const [parameter2, setParameter2] = useState<string>('')
  const [plotType, setPlotType] = useState<PlotType>('LP-PT')
  const [timeRange, setTimeRange] = useState<string>('7d')
  const [sensorData, setSensorData] = useState<SensorDataPoint[]>([])
  const [chartLoading, setChartLoading] = useState(false)

  // Check demo mode on mount
  useEffect(() => {
    api.get('/api/config/mode').then(res => {
      setDemoMode(res.data.demo_mode)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [sitesRes, cropsRes] = await Promise.all([
        api.get('/api/sites'),
        api.get('/api/sites/crops')
      ])
      setSites(sitesRes.data)
      setCrops(cropsRes.data)

      // Select first site by default
      if (sitesRes.data.length > 0) {
        setSelectedSites([sitesRes.data[0].site_code])
      }
    } catch {
      toast.error('Failed to load data', 'Unable to fetch sites and crops from the server')
    } finally {
      setLoading(false)
    }
  }

  // Get the crop ID for the selected crop
  const selectedCropId = selectedCrop === 'all'
    ? (crops.length > 0 ? crops[0].id : null)
    : crops.find(c => c.name === selectedCrop)?.id || null

  const filteredSites = selectedCrop === 'all'
    ? sites
    : sites.filter(s => s.crop_name?.toLowerCase() === selectedCrop)

  const handleSiteToggle = (siteCode: string) => {
    setSelectedSites(prev =>
      prev.includes(siteCode)
        ? prev.filter(s => s !== siteCode)
        : [...prev, siteCode]
    )
  }

  // Fetch sensor data when selections change
  const fetchSensorData = useCallback(async () => {
    if (selectedSites.length === 0 || !parameter1) {
      setSensorData([])
      return
    }

    setChartLoading(true)
    try {
      // Calculate date range
      const end = new Date()
      let start = new Date()

      switch (timeRange) {
        case '1d':
          start.setDate(start.getDate() - 1)
          break
        case '7d':
          start.setDate(start.getDate() - 7)
          break
        case '30d':
          start.setDate(start.getDate() - 30)
          break
        case 'all':
          start = new Date('2020-01-01')
          break
      }

      const params = new URLSearchParams()
      selectedSites.forEach(site => params.append('sites', site))
      params.append('parameters', parameter1)
      if (parameter2 && ['LP-2PT', 'SP-2PT', 'SP-PP'].includes(plotType)) {
        params.append('parameters', parameter2)
      }
      params.append('start', start.toISOString())
      params.append('end', end.toISOString())

      const response = await api.get(`/api/sensors/data?${params.toString()}`)
      setSensorData(response.data.data)
    } catch {
      toast.error('Data fetch failed', 'Unable to retrieve sensor data for selected sites')
      setSensorData([])
    } finally {
      setChartLoading(false)
    }
  }, [selectedSites, parameter1, parameter2, plotType, timeRange])

  // Fetch data when selections change
  useEffect(() => {
    const debounce = setTimeout(fetchSensorData, 300)
    return () => clearTimeout(debounce)
  }, [fetchSensorData])

  // Site colors based on crop
  const siteColorMap = sites.reduce((acc, site) => {
    acc[site.site_code] = cropColors[site.crop_name?.toLowerCase() || ''] || '#888888'
    return acc
  }, {} as Record<string, string>)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm fixed top-0 left-0 right-0 z-50">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden lg:block p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="CSG" className="h-8 w-auto" />
              <span className="font-semibold text-lg hidden sm:block">Flux Dashboard</span>
              {demoMode && (
                <span
                  className="ml-2 px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full cursor-help"
                  title="This is a demo environment. Data resets periodically."
                >
                  Demo Mode
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            {user?.is_admin && (
              <button
                onClick={() => navigate('/admin')}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                title="Admin Portal"
              >
                <Settings size={20} />
              </button>
            )}
            <div className="h-6 w-px bg-border mx-1" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">{user?.full_name}</span>
              <button
                onClick={logout}
                className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-destructive"
                title="Sign out"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="pt-16 flex flex-1">
        {/* Sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: sidebarOpen ? 300 : 0 }}
          className={cn(
            'hidden lg:block border-r border-border bg-card overflow-hidden',
            'fixed top-16 bottom-0 left-0 z-40'
          )}
        >
          <div className="w-[300px] h-full overflow-y-auto p-4 space-y-6">
            {/* Crop Filter */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Crop Type</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCrop('all')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                    selectedCrop === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  All
                </button>
                {crops.map(crop => (
                  <button
                    key={crop.id}
                    onClick={() => setSelectedCrop(crop.name)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                      selectedCrop === crop.name
                        ? 'text-white'
                        : 'bg-muted hover:bg-muted/80'
                    )}
                    style={{
                      backgroundColor: selectedCrop === crop.name ? crop.color : undefined
                    }}
                  >
                    {crop.display_name}
                  </button>
                ))}
              </div>
            </div>

            {/* Sites List */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Sites ({filteredSites.length})
              </h3>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : (
                  filteredSites.map(site => (
                    <button
                      key={site.id}
                      onClick={() => handleSiteToggle(site.site_code)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all',
                        selectedSites.includes(site.site_code)
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cropColors[site.crop_name?.toLowerCase() || ''] || '#888' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{site.site_code}</div>
                        <div className="text-xs text-muted-foreground truncate">{site.name}</div>
                      </div>
                      {selectedSites.includes(site.site_code) && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Chart Controls */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Chart Settings</h3>
              <ChartControls
                cropId={selectedCropId}
                selectedParameter1={parameter1}
                selectedParameter2={parameter2}
                plotType={plotType}
                timeRange={timeRange}
                onParameter1Change={setParameter1}
                onParameter2Change={setParameter2}
                onPlotTypeChange={setPlotType}
                onTimeRangeChange={setTimeRange}
              />
            </div>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main
          className={cn(
            'flex-1 flex flex-col transition-all duration-300',
            sidebarOpen ? 'lg:ml-[300px]' : ''
          )}
        >
          {/* Content wrapper */}
          <div className="flex-1 p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {loading ? (
              <>
                {[1, 2, 3, 4].map(i => (
                  <SkeletonStatsCard key={i} />
                ))}
              </>
            ) : (
              [
                { label: 'Total Sites', value: sites.length, icon: MapPin, color: 'text-blue-500' },
                { label: 'Active Crops', value: crops.length, icon: Leaf, color: 'text-green-500' },
                { label: 'Selected Sites', value: selectedSites.length, icon: BarChart3, color: 'text-purple-500' },
                { label: 'Data Points', value: sensorData.length.toLocaleString(), icon: Settings, color: 'text-amber-500' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-card rounded-xl border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg bg-muted', stat.color)}>
                      <stat.icon size={20} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{stat.value}</div>
                      <div className="text-sm text-muted-foreground">{stat.label}</div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {/* Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {loading ? (
              <>
                <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6">
                  <SkeletonChart height={400} />
                </div>
                <div className="bg-card rounded-xl border border-border p-6">
                  <SkeletonMap height={400} />
                </div>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="lg:col-span-2 bg-card rounded-xl border border-border p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      {parameter1 ? `${parameter1}${parameter2 && ['LP-2PT', 'SP-2PT', 'SP-PP'].includes(plotType) ? ` vs ${parameter2}` : ''}` : 'Sensor Data'}
                    </h2>
                    {chartLoading && (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {!parameter1 ? (
                    <div className="h-[400px] flex items-center justify-center bg-muted/30 rounded-lg border-2 border-dashed border-border">
                      <div className="text-center text-muted-foreground">
                        <BarChart3 size={48} className="mx-auto mb-2 opacity-50" />
                        <p>Select a parameter to view chart</p>
                        <p className="text-sm">Use the controls in the sidebar</p>
                      </div>
                    </div>
                  ) : (
                    <SensorChart
                      data={sensorData}
                      sites={selectedSites}
                      siteColors={siteColorMap}
                      parameter1={parameter1}
                      parameter2={parameter2}
                      plotType={plotType}
                      height={400}
                    />
                  )}
                </motion.div>

                {/* Site Map */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="bg-card rounded-xl border border-border p-6"
                >
                  <h2 className="text-lg font-semibold mb-4">Site Locations</h2>
                  <SiteMap
                    sites={sites}
                    selectedSites={selectedSites}
                    onSiteToggle={handleSiteToggle}
                    height={400}
                  />
                </motion.div>
              </>
            )}
          </div>

          </div>
          {/* Footer */}
          <Footer />
        </main>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-[300px] h-full bg-card border-r border-border p-4 pt-20 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Same content as desktop sidebar */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Crop Type</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCrop('all')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                    selectedCrop === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  All
                </button>
                {crops.map(crop => (
                  <button
                    key={crop.id}
                    onClick={() => setSelectedCrop(crop.name)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                      selectedCrop === crop.name
                        ? 'text-white'
                        : 'bg-muted hover:bg-muted/80'
                    )}
                    style={{
                      backgroundColor: selectedCrop === crop.name ? crop.color : undefined
                    }}
                  >
                    {crop.display_name}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Sites</h3>
              <div className="space-y-1">
                {filteredSites.map(site => (
                  <button
                    key={site.id}
                    onClick={() => handleSiteToggle(site.site_code)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all',
                      selectedSites.includes(site.site_code)
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    )}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cropColors[site.crop_name?.toLowerCase() || ''] || '#888' }}
                    />
                    <span className="text-sm">{site.site_code}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Mobile Chart Controls */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Chart Settings</h3>
              <ChartControls
                cropId={selectedCropId}
                selectedParameter1={parameter1}
                selectedParameter2={parameter2}
                plotType={plotType}
                timeRange={timeRange}
                onParameter1Change={setParameter1}
                onParameter2Change={setParameter2}
                onPlotTypeChange={setPlotType}
                onTimeRangeChange={setTimeRange}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
