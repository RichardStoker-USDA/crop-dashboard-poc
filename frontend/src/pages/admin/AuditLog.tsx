import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useToast } from '@/stores/toastStore'
import {
  RefreshCw,
  Clock,
  User,
  Globe,
  Activity,
  LogIn,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Search,
  Download,
  X,
  Calendar,
  Users,
  FolderPlus,
  Key,
  UserPlus,
  UserMinus,
  Database,
  Upload,
  Box as BoxIcon
} from 'lucide-react'

interface AuditLogEntry {
  id: number
  user_id: string | null
  user_email: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

const actionIcons: Record<string, React.ElementType> = {
  login_success: LogIn,
  login_failed: Shield,
  logout: LogOut,
  user_created: UserPlus,
  user_updated: Pencil,
  user_deleted: Trash2,
  password_changed: Key,
  admin_granted: Shield,
  admin_revoked: Shield,
  user_activated: UserPlus,
  user_deactivated: UserMinus,
  site_created: Plus,
  site_updated: Pencil,
  site_deleted: Trash2,
  group_created: FolderPlus,
  group_updated: Pencil,
  group_deleted: Trash2,
  user_assigned_to_group: Users,
  user_removed_from_group: UserMinus,
  user_role_updated: Users,
  site_assigned_to_group: FolderPlus,
  site_removed_from_group: Trash2,
  database_export: Database,
  database_import: Upload,
  box_connect: BoxIcon,
  box_disconnect: BoxIcon,
  box_configure: BoxIcon,
  box_sync_manual: BoxIcon,
  file_upload: Upload,
  file_delete: Trash2,
  pipeline_import: Database
}

const actionColors: Record<string, string> = {
  login_success: 'text-green-500 bg-green-500/20',
  login_failed: 'text-red-500 bg-red-500/20',
  logout: 'text-orange-500 bg-orange-500/20',
  user_created: 'text-blue-500 bg-blue-500/20',
  user_updated: 'text-purple-500 bg-purple-500/20',
  user_deleted: 'text-red-500 bg-red-500/20',
  password_changed: 'text-amber-500 bg-amber-500/20',
  admin_granted: 'text-green-500 bg-green-500/20',
  admin_revoked: 'text-red-500 bg-red-500/20',
  user_activated: 'text-green-500 bg-green-500/20',
  user_deactivated: 'text-red-500 bg-red-500/20',
  site_created: 'text-green-500 bg-green-500/20',
  site_updated: 'text-purple-500 bg-purple-500/20',
  site_deleted: 'text-red-500 bg-red-500/20',
  group_created: 'text-blue-500 bg-blue-500/20',
  group_updated: 'text-purple-500 bg-purple-500/20',
  group_deleted: 'text-red-500 bg-red-500/20',
  user_assigned_to_group: 'text-blue-500 bg-blue-500/20',
  user_removed_from_group: 'text-orange-500 bg-orange-500/20',
  user_role_updated: 'text-purple-500 bg-purple-500/20',
  site_assigned_to_group: 'text-blue-500 bg-blue-500/20',
  site_removed_from_group: 'text-orange-500 bg-orange-500/20',
  database_export: 'text-cyan-500 bg-cyan-500/20',
  database_import: 'text-cyan-500 bg-cyan-500/20',
  box_connect: 'text-blue-500 bg-blue-500/20',
  box_disconnect: 'text-orange-500 bg-orange-500/20',
  box_configure: 'text-purple-500 bg-purple-500/20',
  box_sync_manual: 'text-blue-500 bg-blue-500/20',
  file_upload: 'text-green-500 bg-green-500/20',
  file_delete: 'text-red-500 bg-red-500/20',
  pipeline_import: 'text-cyan-500 bg-cyan-500/20',
  default: 'text-gray-500 bg-gray-500/20'
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatTimestamp(timestamp: string): string {
  // Backend stores UTC times - append 'Z' if not present to parse as UTC
  const utcStr = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z'
  const date = new Date(utcStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now'
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours} hour${hours > 1 ? 's' : ''} ago`
  }

  // More than 24 hours - show full date in PST
  return date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ' PST'
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterAction, setFilterAction] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const { addToast } = useToast()

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchLogs = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    else setRefreshing(true)

    try {
      const params = new URLSearchParams({ limit: '500' })
      if (filterAction) params.append('action', filterAction)
      if (debouncedSearch) params.append('search', debouncedSearch)
      if (startDate) params.append('start_date', new Date(startDate).toISOString())
      if (endDate) {
        // Set end date to end of day
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        params.append('end_date', end.toISOString())
      }
      const response = await api.get(`/api/admin/audit?${params}`)
      setLogs(response.data)
    } catch {
      addToast('error', 'Failed to load audit logs')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [filterAction, debouncedSearch, startDate, endDate])

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (filterAction) params.append('action', filterAction)
      if (debouncedSearch) params.append('search', debouncedSearch)
      if (startDate) params.append('start_date', new Date(startDate).toISOString())
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        params.append('end_date', end.toISOString())
      }

      const response = await api.get(`/api/admin/audit/export?${params}`, {
        responseType: 'blob'
      })

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      link.setAttribute('download', `audit_log_export_${timestamp}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      addToast('success', 'Audit log exported successfully')
    } catch {
      addToast('error', 'Failed to export audit logs')
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterAction('')
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilters = searchQuery || filterAction || startDate || endDate

  const uniqueActions = [...new Set(logs.map((l) => l.action))].sort()

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-foreground">Audit Log</h2>
        </div>
        <div className="bg-card rounded-xl border border-border animate-pulse">
          <div className="p-6 space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Audit Log</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || logs.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export CSV
          </button>
          <button
            onClick={() => fetchLogs(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        {/* Search Box */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by user email, IP address, action, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Date Range and Action Filter */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Start date"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="End date"
            />
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">All Actions</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {formatAction(action)}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
              Clear filters
            </button>
          )}

          <span className="text-sm text-muted-foreground ml-auto">
            {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>

      {/* Log Timeline */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {logs.map((log) => {
            const Icon = actionIcons[log.action] || Activity
            const colorClass = actionColors[log.action] || actionColors.default

            return (
              <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-foreground">
                        {formatAction(log.action)}
                      </p>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(log.created_at)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                      {log.user_email && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {log.user_email}
                        </span>
                      )}
                      {!log.user_email && log.action === 'login_failed' && log.details?.email !== undefined && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {String(log.details.email)} (failed attempt)
                        </span>
                      )}
                      {log.ip_address && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" />
                          {log.ip_address}
                        </span>
                      )}
                      {log.resource_type && log.resource_id && (
                        <span className="px-2 py-0.5 bg-muted rounded text-xs">
                          {log.resource_type}: {log.resource_id.substring(0, 8)}...
                        </span>
                      )}
                    </div>

                    {log.details && Object.keys(log.details).length > 0 && log.action !== 'login_failed' && (
                      <div className="mt-2 text-xs text-muted-foreground font-mono bg-muted/50 rounded p-2">
                        {JSON.stringify(log.details, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {logs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {hasActiveFilters ? 'No audit log entries match your filters' : 'No audit log entries found'}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Events</p>
          <p className="text-2xl font-bold text-foreground mt-1">{logs.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Successful Logins</p>
          <p className="text-2xl font-bold text-green-500 mt-1">
            {logs.filter((l) => l.action === 'login_success').length}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Failed Logins</p>
          <p className="text-2xl font-bold text-red-500 mt-1">
            {logs.filter((l) => l.action === 'login_failed').length}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Admin Actions</p>
          <p className="text-2xl font-bold text-purple-500 mt-1">
            {logs.filter((l) => l.action.includes('created') || l.action.includes('updated') || l.action.includes('deleted') || l.action.includes('granted') || l.action.includes('revoked')).length}
          </p>
        </div>
      </div>
    </div>
  )
}
