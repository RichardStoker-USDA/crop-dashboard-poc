import { useEffect, useState, useRef } from 'react'
import api from '@/lib/api'
import { useToast } from '@/stores/toastStore'
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  Loader2,
  HardDrive,
  Users,
  Building2,
  MapPin,
  Activity,
  FileText,
  ClipboardList,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'

interface DatabaseStats {
  file_size: number
  tables: {
    users: number
    groups: number
    sites: number
    sensor_data: number
    audit_logs: number
    file_archives: number
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function DatabaseManagement() {
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [isEncrypted, setIsEncrypted] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  const fetchStats = async () => {
    try {
      const [statsResponse, infoResponse] = await Promise.all([
        api.get('/api/pipeline/database/stats'),
        api.get('/api/admin/system-info')
      ])
      setStats(statsResponse.data)
      setIsEncrypted(infoResponse.data.database_encrypted)
    } catch {
      addToast('error', 'Failed to load database stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await api.get('/api/pipeline/database/export', {
        responseType: 'blob'
      })

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      link.setAttribute('download', `csg_dashboard_backup_${timestamp}.db`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      addToast('success', 'Database exported successfully')
    } catch {
      addToast('error', 'Failed to export database')
    } finally {
      setExporting(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.db')) {
        addToast('error', 'Only .db files are allowed')
        return
      }
      setSelectedFile(file)
      setShowImportConfirm(true)
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await api.post('/api/pipeline/database/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      addToast('success', response.data.message)
      addToast('warning', 'Please refresh the page to load the new database')

      setShowImportConfirm(false)
      setSelectedFile(null)

      // Refresh stats after a delay
      setTimeout(() => {
        fetchStats()
      }, 1000)

    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to import database')
    } finally {
      setImporting(false)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const tableInfo = [
    { key: 'users', label: 'Users', icon: Users, color: 'text-blue-500' },
    { key: 'groups', label: 'Groups', icon: Building2, color: 'text-purple-500' },
    { key: 'sites', label: 'Sites', icon: MapPin, color: 'text-green-500' },
    { key: 'sensor_data', label: 'Sensor Records', icon: Activity, color: 'text-amber-500' },
    { key: 'file_archives', label: 'File Archives', icon: FileText, color: 'text-cyan-500' },
    { key: 'audit_logs', label: 'Audit Logs', icon: ClipboardList, color: 'text-pink-500' },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Database Management</h2>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Database Management</h2>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Database Info */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">SQLite Database</h3>
            <p className="text-sm text-muted-foreground">
              Size: {stats ? formatBytes(stats.file_size) : 'Unknown'}
            </p>
          </div>
        </div>

        {/* Table Counts */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {tableInfo.map((table) => (
            <div
              key={table.key}
              className="p-4 bg-background rounded-lg border border-border"
            >
              <div className="flex items-center gap-2 mb-2">
                <table.icon className={`w-4 h-4 ${table.color}`} />
                <span className="text-sm text-muted-foreground">{table.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {stats?.tables[table.key as keyof typeof stats.tables]?.toLocaleString() || 0}
              </p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export Backup
          </button>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".db"
              onChange={handleFileSelect}
              className="hidden"
              id="db-import"
            />
            <label
              htmlFor="db-import"
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Import Backup
            </label>
          </div>
        </div>
      </div>

      {/* Backup & Encryption Info */}
      <div className="bg-gradient-to-br from-slate-500/5 to-zinc-500/10 dark:from-slate-400/5 dark:to-zinc-400/10 rounded-xl border border-slate-500/20 dark:border-slate-400/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Backup & Restore</h3>
        </div>

        <div className="space-y-4 text-sm">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-foreground mb-2">Export</h4>
              <ul className="space-y-1.5 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-muted-foreground/50">-</span>
                  Creates a complete backup of all data
                </li>
                <li className="flex gap-2">
                  <span className="text-muted-foreground/50">-</span>
                  Backup is <strong className="text-foreground">encrypted with SQLCipher</strong>
                </li>
                <li className="flex gap-2">
                  <span className="text-muted-foreground/50">-</span>
                  Cannot be read without the encryption key
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-2">Import</h4>
              <ul className="space-y-1.5 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-muted-foreground/50">-</span>
                  <strong className="text-foreground">Replaces ALL existing data</strong>
                </li>
                <li className="flex gap-2">
                  <span className="text-muted-foreground/50">-</span>
                  Current database is backed up before import
                </li>
                <li className="flex gap-2">
                  <span className="text-muted-foreground/50">-</span>
                  <strong className="text-foreground">Server restart required</strong> after import
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h4 className="font-medium text-foreground mb-2">Encryption Key</h4>
            <p className="text-muted-foreground">
              The <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">DB_ENCRYPTION_KEY</code> in
              your environment file is required to decrypt the database. To restore a backup, the same key must
              be configured before starting the server.
            </p>
          </div>
        </div>
      </div>

      {/* Storage Info */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Storage Information</h3>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Database File</span>
            <span className="text-foreground font-mono">data/crop_dashboard.db</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Database Encrypted</span>
            {isEncrypted === null ? (
              <span className="text-muted-foreground">-</span>
            ) : isEncrypted ? (
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium">
                <ShieldCheck className="w-4 h-4" />
                Yes
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                <ShieldAlert className="w-4 h-4" />
                No
              </span>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Upload Staging</span>
            <span className="text-foreground font-mono">uploads/staging/</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Processed Files</span>
            <span className="text-foreground font-mono">uploads/processed/</span>
          </div>
        </div>
      </div>

      {/* Import Confirmation Modal */}
      {showImportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowImportConfirm(false)} />
          <div className="relative bg-card rounded-xl border border-border p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Confirm Import</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              You are about to import: <strong className="text-foreground">{selectedFile?.name}</strong>
            </p>

            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-500">
                <strong>Warning:</strong> This will replace ALL existing data in the database.
                This action cannot be undone (though a backup will be created).
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowImportConfirm(false)
                  setSelectedFile(null)
                }}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Yes, Import'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
