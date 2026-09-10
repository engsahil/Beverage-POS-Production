import { useState, useEffect, FormEvent } from 'react';
import api from '../api';

interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { products: number };
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/categories');
      setCategories(data.data || []);
    } catch (err: any) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api.post('/categories', { name, description: description || null });
      setName('');
      setDescription('');
      setShowForm(false);
      loadCategories();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create category');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.put(`/categories/${id}`, { isActive: !isActive });
      loadCategories();
    } catch (err) {
      console.error('Failed to toggle category:', err);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading categories...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937' }}>Categories ({categories.length})</h1>
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
          {showForm ? 'Cancel' : '+ New Category'}
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
          <h2 style={{ fontSize: 18, marginBottom: 16, color: '#1f2937' }}>Create Category</h2>
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
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
              {submitting ? 'Creating...' : 'Create Category'}
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
        {categories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            No categories yet. Create your first category to organize products.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Description</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Products</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Status</th>
                <th style={{ textAlign: 'center', padding: 16, fontSize: 14, fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 16, fontWeight: 500 }}>{cat.name}</td>
                  <td style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>{cat.description || '-'}</td>
                  <td style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}>
                    {cat._count?.products || 0}
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      background: cat.isActive ? '#d1fae5' : '#fee2e2',
                      color: cat.isActive ? '#065f46' : '#991b1b',
                    }}>
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(cat.id, cat.isActive)}
                      style={{
                        padding: '6px 12px',
                        background: cat.isActive ? '#fee2e2' : '#d1fae5',
                        color: cat.isActive ? '#991b1b' : '#065f46',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {cat.isActive ? 'Deactivate' : 'Activate'}
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
