import { useEffect, useState, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '@/stores/toastStore'
import {
  Upload,
  Play,
  Trash2,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  FolderOpen,
  ArrowRight
} from 'lucide-react'

interface FileInfo {
  filename: string
  size: number
  modified: string
  status: string
}

interface PipelineStatus {
  staging_files: FileInfo[]
  processed_files: FileInfo[]
  is_processing: boolean
  last_run: string | null
}

interface ProcessingResult {
  filename: string
  status: string
  records_imported: number
  records_skipped: number
  records_duplicate: number
  error_message: string | null
  processing_time: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(dateStr: string): string {
  // Backend stores UTC times - append 'Z' if not present to parse as UTC
  const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
  return new Date(utcStr).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ' PST'
}

export default function Pipeline() {
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<ProcessingResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/api/pipeline/status')
      setStatus(response.data)
    } catch {
      addToast('error', 'Failed to load pipeline status')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    let successCount = 0

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)

      try {
        await api.post('/api/pipeline/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        successCount++
      } catch (error: unknown) {
        const err = error as { response?: { data?: { detail?: string } } }
        addToast('error', `Failed to upload ${file.name}: ${err.response?.data?.detail || 'Unknown error'}`)
      }
    }

    if (successCount > 0) {
      addToast('success', `Uploaded ${successCount} file(s) to staging`)
      fetchStatus()
    }

    setUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleProcess = async (filenames?: string[]) => {
    setProcessing(true)
    setResults([])

    try {
      const response = await api.post('/api/pipeline/process', { filenames })
      setResults(response.data)

      const successCount = response.data.filter((r: ProcessingResult) => r.status === 'success').length
      const totalImported = response.data.reduce((sum: number, r: ProcessingResult) => sum + r.records_imported, 0)

      if (successCount > 0) {
        addToast('success', `Processed ${successCount} file(s), imported ${totalImported} records`)
      } else {
        addToast('warning', 'No files were processed successfully')
      }

      fetchStatus()
    } catch {
      addToast('error', 'Failed to process files')
    } finally {
      setProcessing(false)
    }
  }

  const handleDeleteStaging = async (filename: string) => {
    if (!confirm(`Delete ${filename} from staging?`)) return

    try {
      await api.delete(`/api/pipeline/staging/${encodeURIComponent(filename)}`)
      addToast('success', 'File deleted from staging')
      fetchStatus()
    } catch {
      addToast('error', 'Failed to delete file')
    }
  }

  const handleDeleteProcessed = async (filename: string) => {
    if (!confirm(`Delete ${filename} from processed archive?`)) return

    try {
      await api.delete(`/api/pipeline/processed/${encodeURIComponent(filename)}`)
      addToast('success', 'File deleted from archive')
      fetchStatus()
    } catch {
      addToast('error', 'Failed to delete file')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Data Pipeline</h2>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Data Pipeline</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchStatus()}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Upload Data Files</h3>
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              {uploading ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <p className="text-foreground font-medium">
                {uploading ? 'Uploading...' : 'Click to upload CSV files'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                CSI datalogger format (.csv) - Max 100MB per file
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Pipeline Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staging Files */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-foreground">Staging</h3>
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-xs rounded-full">
                {status?.staging_files.length || 0} files
              </span>
            </div>
            {status?.staging_files && status.staging_files.length > 0 && (
              <button
                onClick={() => handleProcess()}
                disabled={processing}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Process All
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {status?.staging_files.map((file) => (
              <div
                key={file.filename}
                className="flex items-center justify-between p-3 bg-background rounded-lg border border-border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)} - {formatDate(file.modified)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleProcess([file.filename])}
                    disabled={processing}
                    className="p-1.5 hover:bg-primary/10 rounded text-primary"
                    title="Process this file"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteStaging(file.filename)}
                    className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {(!status?.staging_files || status.staging_files.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No files in staging. Upload CSV files above.
              </p>
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="hidden lg:flex items-center justify-center absolute left-1/2 -translate-x-1/2 mt-32">
          <ArrowRight className="w-8 h-8 text-muted-foreground" />
        </div>

        {/* Processed Files */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h3 className="text-lg font-semibold text-foreground">Processed</h3>
            <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs rounded-full">
              {status?.processed_files.length || 0} files
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {status?.processed_files.map((file) => (
              <div
                key={file.filename}
                className="flex items-center justify-between p-3 bg-background rounded-lg border border-border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)} - {formatDate(file.modified)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteProcessed(file.filename)}
                  className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500 flex-shrink-0"
                  title="Delete from archive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {(!status?.processed_files || status.processed_files.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No processed files yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Processing Results */}
      {results.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Processing Results</h3>
          <div className="space-y-3">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border ${
                  result.status === 'success'
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {result.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-medium text-foreground">{result.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    ({result.processing_time.toFixed(2)}s)
                  </span>
                </div>
                {result.status === 'success' ? (
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Imported:</span>{' '}
                      <span className="text-green-500 font-medium">{result.records_imported}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duplicates:</span>{' '}
                      <span className="text-amber-500 font-medium">{result.records_duplicate}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Skipped:</span>{' '}
                      <span className="text-muted-foreground font-medium">{result.records_skipped}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-500">{result.error_message}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Info */}
      {status?.last_run && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          Last processed: {formatDate(status.last_run)}
        </div>
      )}
    </div>
  )
}
