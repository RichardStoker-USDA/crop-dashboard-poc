import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { useToast } from '@/stores/toastStore'
import {
  Users,
  Building2,
  MapPin,
  Database,
  Activity,
  Settings,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'

interface SystemStats {
  total_users: number
  active_users: number
  total_groups: number
  total_sites: number
  active_sites: number
  total_sensor_records: number
  total_parameters: number
  total_equipment_groups: number
}

interface SystemInfo {
  api_version: string
  database_type: string
  database_encrypted: boolean
  data_coverage_start: string | null
  data_coverage_end: string | null
  demo_mode: boolean
}

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ElementType
  color: string
}

function StatCard({ title, value, subtitle, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

export default function Overview() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsResponse, infoResponse] = await Promise.all([
          api.get('/api/admin/stats'),
          api.get('/api/admin/system-info')
        ])
        setStats(statsResponse.data)
        setSystemInfo(infoResponse.data)
      } catch {
        addToast('error', 'Failed to load system data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [addToast])

  const formatDateRange = (start: string | null, end: string | null): string => {
    if (!start || !end) return 'No data'
    const startDate = new Date(start)
    const endDate = new Date(end)
    const formatOpts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }
    const startStr = startDate.toLocaleDateString('en-US', formatOpts)
    const endStr = endDate.toLocaleDateString('en-US', formatOpts)
    return startStr === endStr ? startStr : `${startStr} - ${endStr}`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">System Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-24 mb-3" />
              <div className="h-8 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load stats</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">System Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Users"
          value={stats.total_users}
          subtitle={`${stats.active_users} active`}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="Groups"
          value={stats.total_groups}
          icon={Building2}
          color="bg-purple-500"
        />
        <StatCard
          title="Monitoring Sites"
          value={stats.total_sites}
          subtitle={`${stats.active_sites} active`}
          icon={MapPin}
          color="bg-green-500"
        />
        <StatCard
          title="Sensor Records"
          value={stats.total_sensor_records}
          icon={Database}
          color="bg-orange-500"
        />
        <StatCard
          title="Parameters"
          value={stats.total_parameters}
          icon={Activity}
          color="bg-pink-500"
        />
        <StatCard
          title="Equipment Groups"
          value={stats.total_equipment_groups}
          icon={Settings}
          color="bg-cyan-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              to="/admin/users"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <Users className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Manage Users</p>
                <p className="text-xs text-muted-foreground">Add, edit, or remove user accounts</p>
              </div>
            </Link>
            <Link
              to="/admin/groups"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <Building2 className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Manage Groups</p>
                <p className="text-xs text-muted-foreground">Configure organization groups and site access</p>
              </div>
            </Link>
            <Link
              to="/admin/sites"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <MapPin className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Manage Sites</p>
                <p className="text-xs text-muted-foreground">Add new monitoring sites or edit existing ones</p>
              </div>
            </Link>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">System Information</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Database</span>
              {systemInfo?.database_encrypted ? (
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <ShieldCheck className="w-4 h-4" />
                  {systemInfo.database_type} (Encrypted)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <ShieldAlert className="w-4 h-4" />
                  {systemInfo?.database_type || 'SQLite'} (Not Encrypted)
                </span>
              )}
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">API Version</span>
              <span className="text-foreground">{systemInfo?.api_version || '-'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Data Coverage</span>
              <span className="text-foreground">
                {systemInfo ? formatDateRange(systemInfo.data_coverage_start, systemInfo.data_coverage_end) : '-'}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Demo Mode</span>
              <span className={systemInfo?.demo_mode ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}>
                {systemInfo?.demo_mode ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
