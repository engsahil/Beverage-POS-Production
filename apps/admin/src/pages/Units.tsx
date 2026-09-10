import { useState, useEffect, FormEvent } from 'react';
import api from '../api';

interface Unit {
  id: string;
  name: string;
  shortCode: string;
  isActive: boolean;
}

export default function Units() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/units');
      setUnits(data.data || []);
    } catch (err: any) {
      console.error('Failed to load units:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api.post('/units', { name, shortCode });
      setName('');
      setShortCode('');
      setShowForm(false);
      loadUnits();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create unit');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.put(`/units/${id}`, { isActive: !isActive });
      loadUnits();
    } catch (err) {
      console.error('Failed to toggle unit:', err);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading units...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937' }}>Units ({units.length})</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '10px 20px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {showForm ? 'Cancel' : '+ New Unit'}
        </button>
      </div>

      {showForm && (
        <div style={{
          background: 'white',
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, color: '#1f2937' }}>Create Unit</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g., Milliliter, Liter, Piece"
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
                Short Code *
              </label>
              <input
                type="text"
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                required
                placeholder="e.g., ML, L, PCS"
                maxLength={10}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #dc2626',
                color: '#dc2626',
                padding: 12,
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 14,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 24px',
                background: submitting ? '#9ca3af' : '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating...' : 'Create Unit'}
            </button>
          </form>
        </div>
      )}

      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        {units.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            No units yet. Create units like ML, L, PCS to define product measurements.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Short Code</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Status</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {units.map(unit => (
                <tr key={unit.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 16, fontWeight: 500 }}>{unit.name}</td>
                  <td style={{ padding: 16 }}>
                    <span style={{
                      padding: '4px 10px',
                      background: '#f3f4f6',
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                    }}>
                      {unit.shortCode}
                    </span>
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      background: unit.isActive ? '#d1fae5' : '#fee2e2',
                      color: unit.isActive ? '#065f46' : '#991b1b',
                    }}>
                      {unit.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(unit.id, unit.isActive)}
                      style={{
                        padding: '6px 12px',
                        background: unit.isActive ? '#fee2e2' : '#d1fae5',
                        color: unit.isActive ? '#991b1b' : '#065f46',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {unit.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
