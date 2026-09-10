import { useState, useEffect } from 'react';
import api from '../api';

interface Vendor {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [newVendor, setNewVendor] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    taxId: '',
    notes: '',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    taxId: '',
    notes: '',
  });

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/vendors', {
        params: { limit: 100 }
      });
      setVendors(data.data || []);
    } catch (err: any) {
      setError('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newVendor.name) {
      alert('Vendor name is required');
      return;
    }

    try {
      setCreating(true);
      await api.post('/vendors', newVendor);
      setShowCreateModal(false);
      setNewVendor({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        taxId: '',
        notes: '',
      });
      loadVendors();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create vendor');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      if (currentStatus) {
        await api.post(`/vendors/${id}/disable`);
      } else {
        await api.post(`/vendors/${id}/enable`);
      }
      loadVendors();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update vendor status');
    }
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setEditForm({
      name: vendor.name,
      contactPerson: vendor.contactPerson || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      taxId: vendor.taxId || '',
      notes: vendor.notes || '',
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editingVendor || !editForm.name) {
      alert('Vendor name is required');
      return;
    }

    try {
      setUpdating(true);
      await api.put(`/vendors/${editingVendor.id}`, editForm);
      setShowEditModal(false);
      setEditingVendor(null);
      loadVendors();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update vendor');
    } finally {
      setUpdating(false);
    }
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.phone?.includes(searchTerm)
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading vendors...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Vendors</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>
            {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 20px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          + Add Vendor
        </button>
      </div>

      <div style={{
        background: 'white',
        padding: 16,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        marginBottom: 16,
      }}>
        <input
          type="text"
          placeholder="Search vendors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
          }}
        />
      </div>

      {error && (
        <div style={{
          padding: 16,
          background: '#fef2f2',
          border: '1px solid #dc2626',
          borderRadius: 8,
          color: '#991b1b',
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: 'white',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Vendor Name
              </th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Contact Person
              </th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Phone
              </th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Email
              </th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Status
              </th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredVendors.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                  {searchTerm ? 'No vendors match your search' : 'No vendors found. Add your first vendor to get started.'}
                </td>
              </tr>
            ) : (
              filteredVendors.map((vendor) => (
                <tr key={vendor.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, color: '#1f2937', fontWeight: 500 }}>
                    {vendor.name}
                  </td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>
                    {vendor.contactPerson || '-'}
                  </td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>
                    {vendor.phone || '-'}
                  </td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>
                    {vendor.email || '-'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {vendor.isActive ? (
                      <span style={{
                        padding: '4px 12px',
                        background: '#f0fdf4',
                        color: '#16a34a',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        Active
                      </span>
                    ) : (
                      <span style={{
                        padding: '4px 12px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        Inactive
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => handleEdit(vendor)}
                        style={{
                          padding: '6px 12px',
                          background: '#f3f4f6',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(vendor.id, vendor.isActive)}
                        style={{
                          padding: '6px 12px',
                          background: vendor.isActive ? '#fef2f2' : '#f0fdf4',
                          color: vendor.isActive ? '#dc2626' : '#16a34a',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {vendor.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Vendor Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 32,
            maxWidth: 600,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 24, color: '#1f2937' }}>Add New Vendor</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Vendor Name *
              </label>
              <input
                type="text"
                value={newVendor.name}
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Contact Person
              </label>
              <input
                type="text"
                value={newVendor.contactPerson}
                onChange={(e) => setNewVendor({ ...newVendor, contactPerson: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={newVendor.phone}
                  onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={newVendor.email}
                  onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Address
              </label>
              <textarea
                value={newVendor.address}
                onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Tax ID
              </label>
              <input
                type="text"
                value={newVendor.taxId}
                onChange={(e) => setNewVendor({ ...newVendor, taxId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Notes
              </label>
              <textarea
                value={newVendor.notes}
                onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creating ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newVendor.name}
                style={{
                  padding: '10px 20px',
                  background: creating || !newVendor.name ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creating || !newVendor.name ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? 'Creating...' : 'Create Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vendor Modal */}
      {showEditModal && editingVendor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 32,
            maxWidth: 600,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 24, color: '#1f2937' }}>Edit Vendor</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Vendor Name *
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Contact Person
              </label>
              <input
                type="text"
                value={editForm.contactPerson}
                onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Address
              </label>
              <textarea
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Tax ID
              </label>
              <input
                type="text"
                value={editForm.taxId}
                onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Notes
              </label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingVendor(null);
                }}
                disabled={updating}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: updating ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating || !editForm.name}
                style={{
                  padding: '10px 20px',
                  background: updating || !editForm.name ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: updating || !editForm.name ? 'not-allowed' : 'pointer',
                }}
              >
                {updating ? 'Updating...' : 'Update Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
