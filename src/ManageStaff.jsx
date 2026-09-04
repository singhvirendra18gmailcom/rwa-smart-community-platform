import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from './supabase'
import './App.css'

function ManageStaff({ onBack }) {

  const [staff, setStaff] = useState([])
  const [editingStaff, setEditingStaff] = useState(null)
  const [addingStaff, setAddingStaff] = useState(false)

  const [newStaff, setNewStaff] = useState({
    name: '',
    profession: 'Sweeper'
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadStaff()
  }, [])

  const loadStaff = async () => {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('display_order', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setStaff(data)
    setLoading(false)
  }

  const handleEdit = (person) => {
    setEditingStaff({ ...person })
  }

  const handleSave = async () => {
    if (!editingStaff.name.trim()) {
      alert('Please enter staff name')
      return
    }

    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('staff')
      .update({
        name: editingStaff.name.trim(),
        profession: editingStaff.profession,
        active: editingStaff.active,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingStaff.id)

    if (error) {
      console.error(error)
      setError(error.message)
      setSaving(false)
      return
    }

    await loadStaff()

    setEditingStaff(null)
    setSaving(false)
  }

  const handleAddStaff = async () => {
    const name = newStaff.name.trim()

    if (!name) {
      alert('Please enter staff name')
      return
    }

    setSaving(true)
    setError(null)

    const maxDisplayOrder =
      staff.length > 0
        ? Math.max(
            ...staff.map((person) => person.display_order || 0)
          )
        : 0

    const nextDisplayOrder = maxDisplayOrder + 1

    const { error } = await supabase
      .from('staff')
      .insert({
        name: name,
        profession: newStaff.profession,
        active: true,
        display_order: nextDisplayOrder
      })

    if (error) {
      console.error(error)
      setError(error.message)
      setSaving(false)
      return
    }

    await loadStaff()

    setNewStaff({
      name: '',
      profession: 'Sweeper'
    })

    setAddingStaff(false)
    setSaving(false)
  }

  const cancelAddStaff = () => {
    setAddingStaff(false)

    setNewStaff({
      name: '',
      profession: 'Sweeper'
    })
  }

  if (loading) {
    return (
      <div className="app">
        <main className="dashboard">
          <p>Loading staff...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="app">

      <header className="header attendance-header">

        <button className="back-button" onClick={onBack}>
          ←
        </button>

        <div>
          <h1>Manage Staff</h1>
          <p>RWA Pocket-A</p>
        </div>

      </header>

      <main className="dashboard">

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}

        {!editingStaff && !addingStaff && (
          <>
            <div className="manage-title">

              <div>
                <h2>Staff Profiles</h2>
                <p>Update staff details when required</p>
              </div>

              <button
                className="add-staff-button"
                onClick={() => setAddingStaff(true)}
              >
                <Plus size={18} />
                Add Staff
              </button>

            </div>

            <div className="staff-profile-list">

              {staff.map((person) => (

                <div
                  className="staff-profile-card"
                  key={person.id}
                >

                  <div>
                    <h3>{person.name}</h3>

                    <p>
                      {person.profession}
                      {!person.active && ' • Inactive'}
                    </p>
                  </div>

                  <button
                    className="edit-staff-button"
                    onClick={() => handleEdit(person)}
                  >
                    <Pencil size={17} />
                  </button>

                </div>

              ))}

            </div>
          </>
        )}

        {editingStaff && (

          <div className="edit-staff-card">

            <h2>Edit Staff Profile</h2>

            <label>Name</label>

            <input
              type="text"
              value={editingStaff.name}
              onChange={(e) =>
                setEditingStaff({
                  ...editingStaff,
                  name: e.target.value
                })
              }
            />

            <label>Profession</label>

            <select
              value={editingStaff.profession}
              onChange={(e) =>
                setEditingStaff({
                  ...editingStaff,
                  profession: e.target.value
                })
              }
            >
              <option value="Supervisor">Supervisor</option>
              <option value="Electrician">Electrician</option>
              <option value="Plumber">Plumber</option>
              <option value="Gardener">Gardener</option>
              <option value="Sweeper">Sweeper</option>
              <option value="Housekeeping">Housekeeping</option>
            </select>

            <label>Status</label>

            <select
              value={editingStaff.active ? 'Active' : 'Inactive'}
              onChange={(e) =>
                setEditingStaff({
                  ...editingStaff,
                  active: e.target.value === 'Active'
                })
              }
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            <button
              className="save-profile-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <button
              className="cancel-profile-button"
              onClick={() => setEditingStaff(null)}
              disabled={saving}
            >
              Cancel
            </button>

          </div>

        )}

        {addingStaff && (

          <div className="edit-staff-card">

            <h2>Add Staff</h2>

            <label>Name</label>

            <input
              type="text"
              placeholder="Enter staff name"
              value={newStaff.name}
              onChange={(e) =>
                setNewStaff({
                  ...newStaff,
                  name: e.target.value
                })
              }
            />

            <label>Profession</label>

            <select
              value={newStaff.profession}
              onChange={(e) =>
                setNewStaff({
                  ...newStaff,
                  profession: e.target.value
                })
              }
            >
              <option value="Supervisor">Supervisor</option>
              <option value="Electrician">Electrician</option>
              <option value="Plumber">Plumber</option>
              <option value="Gardener">Gardener</option>
              <option value="Sweeper">Sweeper</option>
              <option value="Housekeeping">Housekeeping</option>
            </select>

            <button
              className="save-profile-button"
              onClick={handleAddStaff}
              disabled={saving}
            >
              {saving ? 'Adding...' : 'Add Staff'}
            </button>

            <button
              className="cancel-profile-button"
              onClick={cancelAddStaff}
              disabled={saving}
            >
              Cancel
            </button>

          </div>

        )}

      </main>

    </div>
  )
}

export default ManageStaff