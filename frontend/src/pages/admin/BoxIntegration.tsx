import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '@/stores/toastStore'
import {
  CloudOff,
  Link,
  Unlink,
  Folder,
  FolderOpen,
  RefreshCw,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  ChevronRight,
  History,
  ArrowLeft,
  Database,
  HardDrive,
  X,
  Cloud,
  Zap,
  Shield,
  Calendar
} from 'lucide-react'

interface ConnectionStatus {
  is_configured: boolean
  is_connected: boolean
  is_active: boolean
  box_user_name: string | null
  box_user_email: string | null
  staging_folder_name: string | null
  processed_folder_name: string | null
  sync_interval_minutes: number
  last_sync: string | null
  last_sync_status: string | null
  last_sync_message: string | null
  files_processed_count: number
  backup_folder_id: string | null
  backup_folder_name: string | null
  backup_enabled: boolean
  backup_schedule: string | null
  backup_time: string | null
  last_backup: string | null
  last_backup_status: string | null
  last_backup_message: string | null
}

interface BoxFolder {
  id: string
  name: string
  type: string
}

interface SyncLog {
  id: number
  started_at: string
  completed_at: string | null
  status: string
  files_found: number
  files_processed: number
  files_failed: number
  records_imported: number
  error_message: string | null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
  return new Date(utcStr).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
  const date = new Date(utcStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// Status badge component
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">N/A</span>

  const styles: Record<string, string> = {
    success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    error: 'bg-red-500/10 text-red-600 border-red-500/20',
    partial: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || 'bg-muted text-muted-foreground border-border'}`}>
      {status === 'success' && <CheckCircle className="w-3 h-3 mr-1" />}
      {status === 'error' && <AlertCircle className="w-3 h-3 mr-1" />}
      {status === 'in_progress' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      <span className="capitalize">{status}</span>
    </span>
  )
}

// Toggle switch component
function Toggle({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
        enabled ? 'bg-emerald-500' : 'bg-muted'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function BoxIntegration() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [folderPickerMode, setFolderPickerMode] = useState<'staging' | 'processed' | 'backup'>('staging')
  const [, setCurrentFolderId] = useState('0')
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([{ id: '0', name: 'All Files' }])
  const [folders, setFolders] = useState<BoxFolder[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [selectedStaging, setSelectedStaging] = useState<{ id: string; name: string } | null>(null)
  const [selectedProcessed, setSelectedProcessed] = useState<{ id: string; name: string } | null>(null)
  const [syncInterval, setSyncInterval] = useState(60)
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [selectedBackupFolder, setSelectedBackupFolder] = useState<{ id: string; name: string } | null>(null)
  const [backupSchedule, setBackupSchedule] = useState<string>('manual')
  const [backupTime, setBackupTime] = useState<string>('02:00')
  const [backupEnabled, setBackupEnabled] = useState(false)
  const [runningBackup, setRunningBackup] = useState(false)
  const [savingBackupConfig, setSavingBackupConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    api.get('/api/config/mode').then(res => {
      setDemoMode(res.data.demo_mode)
    }).catch(() => {})
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/api/box/status')
      setStatus(response.data)
      if (response.data.staging_folder_name) {
        setSelectedStaging({ id: '', name: response.data.staging_folder_name })
      }
      if (response.data.processed_folder_name) {
        setSelectedProcessed({ id: '', name: response.data.processed_folder_name })
      }
      if (response.data.sync_interval_minutes) {
        setSyncInterval(response.data.sync_interval_minutes)
      }
      if (response.data.backup_folder_name) {
        setSelectedBackupFolder({
          id: response.data.backup_folder_id || '',
          name: response.data.backup_folder_name
        })
      }
      setBackupEnabled(response.data.backup_enabled || false)
      setBackupSchedule(response.data.backup_schedule || 'manual')
      setBackupTime(response.data.backup_time || '02:00')
    } catch {
      addToast('error', 'Failed to load Box status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const response = await api.get('/api/box/auth-url')
      const { auth_url, state } = response.data
      sessionStorage.setItem('box_oauth_state', state)
      const popup = window.open(auth_url, 'box_oauth', 'width=600,height=700,scrollbars=yes')
      const pollTimer = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(pollTimer)
          setConnecting(false)
          const urlParams = new URLSearchParams(window.location.search)
          const code = urlParams.get('code')
          const returnedState = urlParams.get('state')
          if (code && returnedState) {
            await completeOAuth(code, returnedState)
            window.history.replaceState({}, '', window.location.pathname)
          } else {
            fetchStatus()
          }
        }
      }, 500)
    } catch (error: unknown) {
      setConnecting(false)
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to start Box OAuth')
    }
  }

  const completeOAuth = async (code: string, state: string) => {
    try {
      const response = await api.post('/api/box/callback', { code, state })
      addToast('success', response.data.message)
      fetchStatus()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to complete Box OAuth')
    }
  }

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const state = urlParams.get('state')
    if (code && state) {
      completeOAuth(code, state)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Box? This will stop automatic syncing and backups.')) return
    try {
      await api.post('/api/box/disconnect')
      addToast('success', 'Box disconnected')
      setSelectedStaging(null)
      setSelectedProcessed(null)
      setSelectedBackupFolder(null)
      setBackupEnabled(false)
      fetchStatus()
    } catch {
      addToast('error', 'Failed to disconnect Box')
    }
  }

  const openFolderPicker = async (mode: 'staging' | 'processed' | 'backup') => {
    setFolderPickerMode(mode)
    setCurrentFolderId('0')
    setFolderPath([{ id: '0', name: 'All Files' }])
    setShowFolderPicker(true)
    await loadFolders('0')
  }

  const loadFolders = async (folderId: string) => {
    setLoadingFolders(true)
    try {
      const response = await api.get(`/api/box/folders?folder_id=${folderId}`)
      setFolders(response.data.folders)
    } catch {
      addToast('error', 'Failed to load folders')
    } finally {
      setLoadingFolders(false)
    }
  }

  const navigateToFolder = async (folder: BoxFolder) => {
    setCurrentFolderId(folder.id)
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }])
    await loadFolders(folder.id)
  }

  const navigateToPath = async (index: number) => {
    const newPath = folderPath.slice(0, index + 1)
    setFolderPath(newPath)
    const folderId = newPath[newPath.length - 1].id
    setCurrentFolderId(folderId)
    await loadFolders(folderId)
  }

  const selectCurrentFolder = () => {
    const currentFolder = folderPath[folderPath.length - 1]
    if (folderPickerMode === 'staging') {
      setSelectedStaging(currentFolder)
    } else if (folderPickerMode === 'processed') {
      setSelectedProcessed(currentFolder)
    } else if (folderPickerMode === 'backup') {
      setSelectedBackupFolder(currentFolder)
    }
    setShowFolderPicker(false)
  }

  const saveConfiguration = async () => {
    if (!selectedStaging?.id || !selectedProcessed?.id) {
      addToast('error', 'Please select both staging and processed folders')
      return
    }
    setSavingConfig(true)
    try {
      await api.post('/api/box/configure', {
        staging_folder_id: selectedStaging.id,
        staging_folder_name: selectedStaging.name,
        processed_folder_id: selectedProcessed.id,
        processed_folder_name: selectedProcessed.name,
        sync_interval_minutes: syncInterval
      })
      addToast('success', 'Configuration saved')
      fetchStatus()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to save configuration')
    } finally {
      setSavingConfig(false)
    }
  }

  const triggerSync = async () => {
    setSyncing(true)
    try {
      const response = await api.post('/api/box/sync')
      if (response.data.status === 'success' || response.data.status === 'partial') {
        addToast('success', `Sync complete: ${response.data.files_processed} files processed`)
      } else if (response.data.status === 'skipped') {
        addToast('warning', response.data.message || 'Sync skipped')
      } else {
        addToast('error', response.data.errors?.join('; ') || 'Sync failed')
      }
      fetchStatus()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to trigger sync')
    } finally {
      setSyncing(false)
    }
  }

  const loadLogs = async () => {
    try {
      const response = await api.get('/api/box/logs')
      setLogs(response.data.logs)
      setShowLogs(true)
    } catch {
      addToast('error', 'Failed to load sync logs')
    }
  }

  const saveBackupConfiguration = async () => {
    if (!selectedBackupFolder?.id) {
      addToast('error', 'Please select a backup folder')
      return
    }
    setSavingBackupConfig(true)
    try {
      await api.post('/api/box/backup/configure', {
        backup_folder_id: selectedBackupFolder.id,
        backup_folder_name: selectedBackupFolder.name,
        backup_enabled: backupEnabled,
        backup_schedule: backupSchedule,
        backup_time: backupSchedule !== 'manual' ? backupTime : null
      })
      addToast('success', 'Backup configuration saved')
      fetchStatus()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to save backup configuration')
    } finally {
      setSavingBackupConfig(false)
    }
  }

  const runManualBackup = async () => {
    if (!selectedBackupFolder?.id && !status?.backup_folder_name) {
      addToast('error', 'Please configure a backup folder first')
      return
    }
    setRunningBackup(true)
    try {
      const response = await api.post('/api/box/backup/run')
      if (response.data.status === 'success') {
        addToast('success', response.data.message || 'Backup completed successfully')
      } else {
        addToast('error', response.data.message || 'Backup failed')
      }
      fetchStatus()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to run backup')
    } finally {
      setRunningBackup(false)
    }
  }

  const disableBackup = async () => {
    try {
      await api.delete('/api/box/backup/configure')
      addToast('success', 'Backup disabled')
      setSelectedBackupFolder(null)
      setBackupEnabled(false)
      setBackupSchedule('manual')
      fetchStatus()
    } catch {
      addToast('error', 'Failed to disable backup')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-foreground">Box Integration</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (demoMode) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Box Integration</h1>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/10 rounded-lg">
              <CloudOff className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Demo Mode Active</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Box integration is disabled in demo mode. In production, connect to Box for automated file sync.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Box Integration</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect to Box for automated file sync and backups</p>
        </div>
        <button
          onClick={fetchStatus}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Not Configured Warning */}
      {!status?.is_configured && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-amber-500/10 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">Configuration Required</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Set <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">BOX_CLIENT_ID</code> and{' '}
                <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">BOX_CLIENT_SECRET</code> in your environment.
              </p>
              <a
                href="https://app.box.com/developers/console"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
              >
                Open Box Developer Console
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Connection Card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                status?.is_connected ? 'bg-blue-500/10' : 'bg-muted'
              }`}>
                <Cloud className={`w-7 h-7 ${status?.is_connected ? 'text-blue-500' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {status?.is_connected ? 'Connected' : 'Not Connected'}
                  </h2>
                  {status?.is_connected && status.is_active && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-600 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                {status?.is_connected ? (
                  <p className="text-sm text-muted-foreground">{status.box_user_email}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Connect your Box account to get started</p>
                )}
              </div>
            </div>

            {status?.is_configured && (
              status?.is_connected ? (
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Unlink className="w-4 h-4" />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {connecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link className="w-4 h-4" />
                  )}
                  Connect to Box
                </button>
              )
            )}
          </div>
        </div>

        {/* Connection Stats */}
        {status?.is_connected && status.is_active && (
          <div className="grid grid-cols-4 divide-x divide-border border-t border-border bg-muted/30">
            <div className="p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{status.files_processed_count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Files Processed</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{status.sync_interval_minutes}m</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sync Interval</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-sm font-medium text-foreground">{formatRelativeTime(status.last_sync)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Last Sync</p>
            </div>
            <div className="p-4 text-center">
              <StatusBadge status={status.last_sync_status} />
              <p className="text-xs text-muted-foreground mt-1">Status</p>
            </div>
          </div>
        )}
      </div>

      {/* Configuration Sections */}
      {status?.is_connected && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* File Sync Configuration */}
          <div className="bg-card border border-border rounded-xl">
            <div className="p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Zap className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">File Sync</h3>
                  <p className="text-xs text-muted-foreground">Automatic CSV import from Box</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Staging Folder */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Staging Folder</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {selectedStaging?.name || status.staging_folder_name || 'Not selected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openFolderPicker('staging')}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {selectedStaging ? 'Change' : 'Select'}
                </button>
              </div>

              {/* Processed Folder */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Folder className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Processed Folder</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {selectedProcessed?.name || status.processed_folder_name || 'Not selected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openFolderPicker('processed')}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {selectedProcessed ? 'Change' : 'Select'}
                </button>
              </div>

              {/* Sync Interval */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-blue-500" />
                  <p className="text-sm font-medium text-foreground">Sync Interval</p>
                </div>
                <select
                  value={syncInterval}
                  onChange={(e) => setSyncInterval(Number(e.target.value))}
                  className="text-sm bg-muted border-0 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/50"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={360}>6 hours</option>
                  <option value={720}>12 hours</option>
                  <option value={1440}>Daily</option>
                </select>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  onClick={saveConfiguration}
                  disabled={savingConfig || !selectedStaging?.id || !selectedProcessed?.id}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Config
                </button>
                {status.is_active && (
                  <button
                    onClick={triggerSync}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground text-sm font-medium rounded-lg hover:bg-muted/80 disabled:opacity-50 transition-colors"
                  >
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Sync
                  </button>
                )}
                <button
                  onClick={loadLogs}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  title="View History"
                >
                  <History className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Database Backup Configuration */}
          <div className="bg-card border border-border rounded-xl">
            <div className="p-5 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <Shield className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Database Backup</h3>
                    <p className="text-xs text-muted-foreground">Encrypted backup to Box</p>
                  </div>
                </div>
                {(selectedBackupFolder?.id || status.backup_folder_name) && (
                  <Toggle enabled={backupEnabled} onChange={() => setBackupEnabled(!backupEnabled)} />
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Backup Folder */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-5 h-5 text-cyan-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Backup Folder</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {selectedBackupFolder?.name || status.backup_folder_name || 'Not selected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openFolderPicker('backup')}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {selectedBackupFolder?.name || status.backup_folder_name ? 'Change' : 'Select'}
                </button>
              </div>

              {/* Backup Schedule */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-cyan-500" />
                  <p className="text-sm font-medium text-foreground">Schedule</p>
                </div>
                <select
                  value={backupSchedule}
                  onChange={(e) => setBackupSchedule(e.target.value)}
                  className="text-sm bg-muted border-0 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/50"
                >
                  <option value="manual">Manual</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              {/* Backup Time */}
              {backupSchedule !== 'manual' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-cyan-500" />
                    <p className="text-sm font-medium text-foreground">Time</p>
                  </div>
                  <input
                    type="time"
                    value={backupTime}
                    onChange={(e) => setBackupTime(e.target.value)}
                    className="text-sm bg-muted border-0 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              {/* Last Backup Status */}
              {status.last_backup && (
                <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">Last backup</p>
                    <p className="text-sm font-medium text-foreground">{formatDate(status.last_backup)}</p>
                  </div>
                  <StatusBadge status={status.last_backup_status} />
                </div>
              )}

              <div className="pt-3 flex gap-2">
                <button
                  onClick={saveBackupConfiguration}
                  disabled={savingBackupConfig || !selectedBackupFolder?.id}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingBackupConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Config
                </button>
                <button
                  onClick={runManualBackup}
                  disabled={runningBackup || (!selectedBackupFolder?.id && !status.backup_folder_name)}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white text-sm font-medium rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
                >
                  {runningBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  Backup
                </button>
                {(selectedBackupFolder?.id || status.backup_folder_name) && (
                  <button
                    onClick={disableBackup}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Disable Backup"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Not Connected Backup Placeholder */}
      {!status?.is_connected && status?.is_configured && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mx-auto mb-4">
            <Database className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground">Database Backup</h3>
          <p className="text-sm text-muted-foreground mt-1">Connect to Box to enable automated backups</p>
        </div>
      )}

      {/* Folder Picker Modal */}
      {showFolderPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFolderPicker(false)} />
          <div className="relative bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">
                Select {folderPickerMode === 'staging' ? 'Staging' : folderPickerMode === 'processed' ? 'Processed' : 'Backup'} Folder
              </h3>
              <div className="flex items-center gap-1 text-sm mt-2 overflow-x-auto">
                {folderPath.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-1 flex-shrink-0">
                    {index > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <button
                      onClick={() => navigateToPath(index)}
                      className={`hover:text-primary transition-colors ${
                        index === folderPath.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
                      }`}
                    >
                      {item.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {loadingFolders ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : folders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No subfolders found
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => navigateToFolder(folder)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-muted transition-colors text-left"
                    >
                      <Folder className="w-5 h-5 text-blue-500" />
                      <span className="text-sm text-foreground flex-1 truncate">{folder.name}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border bg-muted/30 flex gap-3">
              <button
                onClick={() => setShowFolderPicker(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={selectCurrentFolder}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Select This Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLogs(false)} />
          <div className="relative bg-card rounded-2xl border border-border w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Sync History</h3>
              <button
                onClick={() => setShowLogs(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-4 space-y-3">
              {logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No sync history yet</p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-xl border border-border bg-muted/30"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <StatusBadge status={log.status} />
                      <span className="text-xs text-muted-foreground">{formatDate(log.started_at)}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-lg font-semibold text-foreground">{log.files_found}</p>
                        <p className="text-xs text-muted-foreground">Found</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-emerald-500">{log.files_processed}</p>
                        <p className="text-xs text-muted-foreground">Processed</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-red-500">{log.files_failed}</p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-foreground">{log.records_imported}</p>
                        <p className="text-xs text-muted-foreground">Records</p>
                      </div>
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-red-500 mt-3 p-2 bg-red-500/10 rounded">{log.error_message}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
