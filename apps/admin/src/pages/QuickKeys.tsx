import { useState, useEffect } from 'react';
import api from '../api';

interface QuickKey {
  id: string;
  productId: string;
  product: { name: string; sellingPrice: number };
  label: string;
  sortOrder: number;
  isActive: boolean;
}

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  category?: { name: string };
}

export default function QuickKeys() {
  const [quickKeys, setQuickKeys] = useState<QuickKey[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    productId: '',
    label: '',
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    loadQuickKeys();
    loadProducts();
  }, []);

  const loadQuickKeys = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/settings/pos-quick-keys');
      setQuickKeys(data.data || []);
    } catch (err) {
      setQuickKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', { params: { limit: 200, isActive: true } });
      setProducts(data.data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  };

  const handleCreate = async () => {
    if (!form.productId) {
      alert('Please select a product');
      return;
    }

    try {
      await api.post('/settings/pos-quick-keys', form);
      setShowForm(false);
      setForm({ productId: '', label: '', sortOrder: quickKeys.length, isActive: true });
      loadQuickKeys();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create quick key');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this quick key?')) return;
    try {
      await api.delete(`/settings/pos-quick-keys/${id}`);
      loadQuickKeys();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to delete');
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await api.patch(`/settings/pos-quick-keys/${id}`, { isActive: !currentStatus });
      loadQuickKeys();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update');
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all quick keys to defaults? This will remove all custom configurations.')) return;
    try {
      await api.post('/settings/pos-quick-keys/reset');
      loadQuickKeys();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to reset');
    }
  };

  const moveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...quickKeys];
    [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    try {
      await api.put('/settings/pos-quick-keys/reorder', { ids: updated.map(q => q.id) });
      loadQuickKeys();
    } catch (err: any) {
      alert('Failed to reorder');
    }
  };

  const moveDown = async (index: number) => {
    if (index === quickKeys.length - 1) return;
    const updated = [...quickKeys];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    try {
      await api.put('/settings/pos-quick-keys/reorder', { ids: updated.map(q => q.id) });
      loadQuickKeys();
    } catch (err: any) {
      alert('Failed to reorder');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>POS Quick Keys</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>Configure frequently sold products for quick access in POS</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleReset} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Reset to Defaults</button>
          <button onClick={() => setShowForm(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+ Add Quick Key</button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        {quickKeys.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>No quick keys configured</p>
            <p style={{ fontSize: 14 }}>Add products to create quick access buttons in POS</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
            {quickKeys.map((qk, index) => (
              <div key={qk.id} style={{ padding: 16, background: qk.isActive ? '#f9fafb' : '#fef2f2', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{qk.label || qk.product.name}</div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Rs. {Number(qk.product.sellingPrice).toFixed(2)}</div>
                  </div>
                  <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: qk.isActive ? '#f0fdf4' : '#fef2f2', color: qk.isActive ? '#16a34a' : '#dc2626' }}>
                    {qk.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button onClick={() => moveUp(index)} disabled={index === 0} style={{ flex: 1, padding: '6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.5 : 1 }}>↑ Up</button>
                  <button onClick={() => moveDown(index)} disabled={index === quickKeys.length - 1} style={{ flex: 1, padding: '6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, cursor: index === quickKeys.length - 1 ? 'not-allowed' : 'pointer', opacity: index === quickKeys.length - 1 ? 0.5 : 1 }}>↓ Down</button>
                  <button onClick={() => handleToggle(qk.id, qk.isActive)} style={{ flex: 1, padding: '6px', background: qk.isActive ? '#fef2f2' : '#f0fdf4', color: qk.isActive ? '#dc2626' : '#16a34a', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{qk.isActive ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => handleDelete(qk.id)} style={{ padding: '6px 12px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 500, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 20 }}>Add Quick Key</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Product *</label>
              <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                <option value="">Select Product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} - Rs. {Number(p.sellingPrice).toFixed(2)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Custom Label (Optional)</label>
              <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Leave blank to use product name" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span style={{ fontSize: 14 }}>Active</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={!form.productId} style={{ padding: '10px 20px', background: !form.productId ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Add Quick Key</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
