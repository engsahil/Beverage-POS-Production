import { useState, useEffect } from 'react';
import api from '../api';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  variants?: Array<{ id: string; name: string }>;
}

interface Branch {
  id: string;
  name: string;
}

interface OpeningStockEntry {
  id: string;
  productId: string;
  product: { name: string };
  variantId: string | null;
  variant?: { name: string } | null;
  branchId: string;
  branch: { name: string };
  quantity: number;
  unitCost: number;
  totalCost: number;
  batchNumber: string | null;
  notes: string | null;
  createdAt: string;
  user: { fullName: string };
}

export default function OpeningStock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [entries, setEntries] = useState<OpeningStockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    productId: '',
    variantId: '',
    branchId: '',
    quantity: 0,
    unitCost: 0,
    batchNumber: '',
    notes: '',
  });

  useEffect(() => {
    loadProducts();
    loadBranches();
    loadEntries();
  }, []);

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', { params: { include: 'variants' } });
      setProducts(data.data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  };

  const loadBranches = async () => {
    try {
      const { data } = await api.get('/branches');
      setBranches(data.data || []);
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  };

  const loadEntries = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/inventory/opening-stock');
      setEntries(data.data || []);
    } catch (err) {
      console.error('Failed to load entries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.productId || !form.branchId || form.quantity <= 0 || form.unitCost < 0) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await api.post('/inventory/opening-stock', {
        ...form,
        variantId: form.variantId || null,
        batchNumber: form.batchNumber || null,
        reason: form.notes || 'Opening stock entry',
        notes: form.notes || null,
      });
      setShowForm(false);
      setForm({ productId: '', variantId: '', branchId: '', quantity: 0, unitCost: 0, batchNumber: '', notes: '' });
      loadEntries();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to record opening stock');
    }
  };

  const selectedProduct = products.find(p => p.id === form.productId);
  const totalCost = form.quantity * form.unitCost;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Opening Stock</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>Record initial inventory quantities</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Opening Stock
        </button>
      </div>

      <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Stock Entry History</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Product</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Variant</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Branch</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Quantity</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Unit Cost</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Total Cost</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No opening stock entries yet</td></tr>
            ) : (
              entries.map(entry => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{new Date(entry.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{entry.product.name}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{entry.variant?.name || '-'}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{entry.branch.name}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>{entry.quantity}</td>
                  <td style={{ padding: 12, fontSize: 13, textAlign: 'right' }}>Rs. {Number(entry.unitCost).toFixed(2)}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>Rs. {Number(entry.totalCost).toFixed(2)}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{entry.user.fullName}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 600, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 20 }}>Record Opening Stock</h2>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Product *</label>
              <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value, variantId: '' })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                <option value="">Select Product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
              </select>
            </div>

            {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Variant</label>
                <select value={form.variantId} onChange={(e) => setForm({ ...form, variantId: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                  <option value="">No Variant (Base Product)</option>
                  {selectedProduct.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Branch *</label>
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Quantity *</label>
                <input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Unit Cost *</label>
                <input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Batch Number</label>
              <input type="text" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="Optional" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>

            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
                <span>Total Cost:</span>
                <span style={{ color: '#dc2626' }}>Rs. {totalCost.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={!form.productId || !form.branchId || form.quantity <= 0 || form.unitCost < 0} style={{ padding: '10px 20px', background: (!form.productId || !form.branchId || form.quantity <= 0 || form.unitCost < 0) ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Record Opening Stock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
