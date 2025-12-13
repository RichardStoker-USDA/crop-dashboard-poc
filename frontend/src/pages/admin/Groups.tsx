import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useToast } from '@/stores/toastStore'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Users,
  MapPin,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'

interface GroupMember {
  user_id: string
  email: string
  full_name: string
  role: string
}

interface GroupSite {
  site_id: string
  site_code: string
  site_name: string
}

interface Group {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  member_count: number
  site_count: number
  members?: GroupMember[]
  sites?: GroupSite[]
}

interface User {
  id: string
  email: string
  full_name: string
}

interface Site {
  id: string
  site_code: string
  name: string
  crop_name: string
}

interface GroupFormData {
  name: string
  description: string
}

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [allSites, setAllSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupDetails, setGroupDetails] = useState<Record<string, Group>>({})
  const [showModal, setShowModal] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showAddSiteModal, setShowAddSiteModal] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [formData, setFormData] = useState<GroupFormData>({ name: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('viewer')
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const { addToast } = useToast()

  const fetchGroups = async () => {
    try {
      const response = await api.get('/api/groups')
      setGroups(response.data)
    } catch {
      addToast('error', 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setAllUsers(response.data)
    } catch {
      // Silent fail - users dropdown will be empty
    }
  }

  const fetchAllSites = async () => {
    try {
      const response = await api.get('/api/admin/sites')
      setAllSites(response.data)
    } catch {
      // Silent fail - sites dropdown will be empty
    }
  }

  useEffect(() => {
    fetchGroups()
    fetchAllUsers()
    fetchAllSites()
  }, [])

  const fetchGroupDetails = async (groupId: string) => {
    try {
      const response = await api.get(`/api/groups/${groupId}`)
      setGroupDetails((prev) => ({ ...prev, [groupId]: response.data }))
    } catch {
      addToast('error', 'Failed to load group details')
    }
  }

  const toggleExpanded = (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null)
    } else {
      setExpandedGroup(groupId)
      if (!groupDetails[groupId]) {
        fetchGroupDetails(groupId)
      }
    }
  }

  const openCreateModal = () => {
    setEditingGroup(null)
    setFormData({ name: '', description: '' })
    setShowModal(true)
  }

  const openEditModal = (group: Group) => {
    setEditingGroup(group)
    setFormData({ name: group.name, description: group.description || '' })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingGroup(null)
    setFormData({ name: '', description: '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (editingGroup) {
        await api.put(`/api/groups/${editingGroup.id}`, formData)
        addToast('success', 'Group updated successfully')
      } else {
        await api.post('/api/groups', formData)
        addToast('success', 'Group created successfully')
      }
      closeModal()
      fetchGroups()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      addToast('error', err.response?.data?.detail || 'Failed to save group')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (group: Group) => {
    if (!confirm(`Are you sure you want to delete "${group.name}"? This will remove all user and site assignments.`)) {
      return
    }

    try {
      await api.delete(`/api/groups/${group.id}`)
      addToast('success', 'Group deleted successfully')
      fetchGroups()
    } catch {
      addToast('error', 'Failed to delete group')
    }
  }

  const openAddUserModal = (groupId: string) => {
    setActiveGroupId(groupId)
    setSelectedUserId('')
    setSelectedRole('viewer')
    setShowAddUserModal(true)
  }

  const handleAddUser = async () => {
    if (!activeGroupId || !selectedUserId) return
    setSubmitting(true)
    try {
      await api.post(`/api/groups/${activeGroupId}/users`, {
        user_id: selectedUserId,
        role: selectedRole
      })
      addToast('success', 'User added to group')
      setShowAddUserModal(false)
      fetchGroupDetails(activeGroupId)
      fetchGroups()
    } catch {
      addToast('error', 'Failed to add user to group')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveUser = async (groupId: string, userId: string) => {
    try {
      await api.delete(`/api/groups/${groupId}/users/${userId}`)
      addToast('success', 'User removed from group')
      fetchGroupDetails(groupId)
      fetchGroups()
    } catch {
      addToast('error', 'Failed to remove user')
    }
  }

  const openAddSiteModal = (groupId: string) => {
    setActiveGroupId(groupId)
    setSelectedSiteId('')
    setShowAddSiteModal(true)
  }

  const handleAddSite = async () => {
    if (!activeGroupId || !selectedSiteId) return
    setSubmitting(true)
    try {
      await api.post(`/api/groups/${activeGroupId}/sites`, { site_id: selectedSiteId })
      addToast('success', 'Site added to group')
      setShowAddSiteModal(false)
      fetchGroupDetails(activeGroupId)
      fetchGroups()
    } catch {
      addToast('error', 'Failed to add site to group')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveSite = async (groupId: string, siteId: string) => {
    try {
      await api.delete(`/api/groups/${groupId}/sites/${siteId}`)
      addToast('success', 'Site removed from group')
      fetchGroupDetails(groupId)
      fetchGroups()
    } catch {
      addToast('error', 'Failed to remove site')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-foreground">Group Management</h2>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-6 animate-pulse">
              <div className="h-6 bg-muted rounded w-48 mb-2" />
              <div className="h-4 bg-muted rounded w-32" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Group Management</h2>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Group
        </button>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="bg-card rounded-xl border border-border overflow-hidden">
            <div
              className="flex items-center justify-between p-6 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleExpanded(group.id)}
            >
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">{group.name}</h3>
                <p className="text-sm text-muted-foreground">{group.description || 'No description'}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {group.member_count} members
                  </span>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {group.site_count} sites
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openEditModal(group); }}
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(group); }}
                  className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-muted-foreground hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {expandedGroup === group.id ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </div>

            {expandedGroup === group.id && (
              <div className="border-t border-border p-6 bg-muted/20">
                {groupDetails[group.id] ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Members */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-foreground">Members</h4>
                        <button
                          onClick={() => openAddUserModal(group.id)}
                          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                        >
                          <Plus className="w-4 h-4" />
                          Add User
                        </button>
                      </div>
                      <div className="space-y-2">
                        {groupDetails[group.id].members?.map((member) => (
                          <div key={member.user_id} className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
                            <div>
                              <p className="text-sm font-medium text-foreground">{member.full_name}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 rounded text-xs">
                                {member.role}
                              </span>
                              <button
                                onClick={() => handleRemoveUser(group.id, member.user_id)}
                                className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(!groupDetails[group.id].members || groupDetails[group.id].members?.length === 0) && (
                          <p className="text-sm text-muted-foreground py-4 text-center">No members</p>
                        )}
                      </div>
                    </div>

                    {/* Sites */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-foreground">Sites</h4>
                        <button
                          onClick={() => openAddSiteModal(group.id)}
                          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                        >
                          <Plus className="w-4 h-4" />
                          Add Site
                        </button>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {groupDetails[group.id].sites?.map((site) => (
                          <div key={site.site_id} className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
                            <div>
                              <p className="text-sm font-medium text-foreground">{site.site_code}</p>
                              <p className="text-xs text-muted-foreground">{site.site_name}</p>
                            </div>
                            <button
                              onClick={() => handleRemoveSite(group.id, site.site_id)}
                              className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {(!groupDetails[group.id].sites || groupDetails[group.id].sites?.length === 0) && (
                          <p className="text-sm text-muted-foreground py-4 text-center">No sites assigned</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-border">
            No groups found. Create one to get started.
          </div>
        )}
      </div>

      {/* Create/Edit Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-card rounded-xl border border-border p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">
                {editingGroup ? 'Edit Group' : 'Create Group'}
              </h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground resize-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingGroup ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddUserModal(false)} />
          <div className="relative bg-card rounded-xl border border-border p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Add User to Group</h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                >
                  <option value="">Select a user...</option>
                  {allUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddUserModal(false)} className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={handleAddUser} disabled={!selectedUserId || submitting} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Site Modal */}
      {showAddSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddSiteModal(false)} />
          <div className="relative bg-card rounded-xl border border-border p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Add Site to Group</h3>
              <button onClick={() => setShowAddSiteModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Site</label>
                <select
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                >
                  <option value="">Select a site...</option>
                  {allSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.site_code} - {site.name} ({site.crop_name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddSiteModal(false)} className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={handleAddSite} disabled={!selectedSiteId || submitting} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Site
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
