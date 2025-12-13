import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useToast } from '@/stores/toastStore'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  MapPin,
  Loader2
} from 'lucide-react'

interface Crop {
  id: string
  name: string
  display_name: string
  color: string
  site_count: number
}

interface Site {
  id: string
  site_code: string
  name: string
  crop_id: string
  crop_name: string | null
  latitude: number
  longitude: number
  is_active: boolean
}

interface SiteFormData {
  site_code: string
  name: string
  crop_id: string
  latitude: string
  longitude: string
}

const initialFormData: SiteFormData = {
  site_code: '',
  name: '',
  crop_id: '',
  latitude: '',
  longitude: ''
}

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [formData, setFormData] = useState<SiteFormData>(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterCrop, setFilterCrop] = useState<string>('')
  const { addToast } = useToast()

  const fetchSites = async () => {
    try {
      const response = await api.get('/api/admin/sites')
      setSites(response.data)
    } catch {
      addToast('error', 'Failed to load sites')
    } finally {
      setLoading(false)
    }
  }

  const fetchCrops = async () => {
    try {
      const response = await api.get('/api/admin/crops')
      setCrops(response.data)
    } catch {
      // Silent fail - crops dropdown will be empty
    }
  }

  useEffect(() => {
    fetchSites()
    fetchCrops()
  }, [])

  const openCreateModal = () => {
    setEditingSite(null)
    setFormData(initialFormData)
    setShowModal(true)
  }

  const openEditModal = (site: Site) => {
    setEditingSite(site)
    setFormData({
      site_code: site.site_code,
      name: site.name,
      crop_id: site.crop_id,
      latitude: site.latitude.toString(),
      longitude: site.longitude.toString()
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingSite(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const payload = {
      site_code: formData.site_code,
      name: formData.name,
      crop_id: formData.crop_id,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude)
    }

    try {
      if (editingSite) {
        await api.put(`/api/admin/sites/${editingSite.id}`, payload)
        addToast('success', 'Site updated successfully')
      } else {
        await api.post('/api/admin/sites', payload)
        addToast('success', 'Site created successfully')
      }
      closeModal()
      fetchSites()
      fetchCrops()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to save site')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (site: Site) => {
    if (!confirm(`Are you sure you want to delete ${site.site_code}? This will also delete all associated sensor data.`)) {
      return
    }

    setDeletingId(site.id)
    try {
      await api.delete(`/api/admin/sites/${site.id}`)
      addToast('success', 'Site deleted successfully')
      fetchSites()
      fetchCrops()
    } catch {
      addToast('error', 'Failed to delete site')
    } finally {
      setDeletingId(null)
    }
  }

  const toggleActive = async (site: Site) => {
    try {
      await api.put(`/api/admin/sites/${site.id}`, { is_active: !site.is_active })
      addToast('success', `Site ${site.is_active ? 'deactivated' : 'activated'}`)
      fetchSites()
    } catch {
      addToast('error', 'Failed to update site status')
    }
  }

  const filteredSites = filterCrop
    ? sites.filter((s) => s.crop_id === filterCrop)
    : sites

  const getCropColor = (cropId: string) => {
    const crop = crops.find((c) => c.id === cropId)
    return crop?.color || '#6B7280'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-foreground">Site Management</h2>
        </div>
        <div className="bg-card rounded-xl border border-border animate-pulse">
          <div className="p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Site Management</h2>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Site
        </button>
      </div>

      {/* Crop Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Filter by crop:</span>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterCrop('')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filterCrop === ''
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            All ({sites.length})
          </button>
          {crops.map((crop) => (
            <button
              key={crop.id}
              onClick={() => setFilterCrop(crop.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                filterCrop === crop.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: crop.color }}
              />
              {crop.display_name} ({crop.site_count})
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Site</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Crop</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Coordinates</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSites.map((site) => (
              <tr key={site.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${getCropColor(site.crop_id)}20` }}
                    >
                      <MapPin className="w-5 h-5" style={{ color: getCropColor(site.crop_id) }} />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{site.site_code}</p>
                      <p className="text-sm text-muted-foreground">{site.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: `${getCropColor(site.crop_id)}20`,
                      color: getCropColor(site.crop_id)
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getCropColor(site.crop_id) }}
                    />
                    {site.crop_name}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                  {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleActive(site)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      site.is_active
                        ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                        : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                    }`}
                  >
                    {site.is_active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {site.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEditModal(site)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                      title="Edit site"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(site)}
                      disabled={deletingId === site.id}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-muted-foreground hover:text-red-500 disabled:opacity-50"
                      title="Delete site"
                    >
                      {deletingId === site.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredSites.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {filterCrop ? 'No sites found for this crop' : 'No sites found'}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-card rounded-xl border border-border p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">
                {editingSite ? 'Edit Site' : 'Create Site'}
              </h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Site Code
                </label>
                <input
                  type="text"
                  value={formData.site_code}
                  onChange={(e) => setFormData({ ...formData, site_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., ABC_001"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Site Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., North Valley Almonds"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Crop Type
                </label>
                <select
                  value={formData.crop_id}
                  onChange={(e) => setFormData({ ...formData, crop_id: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  required
                >
                  <option value="">Select a crop...</option>
                  {crops.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    placeholder="e.g., 38.5"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    placeholder="e.g., -121.5"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingSite ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
