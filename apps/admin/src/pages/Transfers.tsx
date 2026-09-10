import { useState, useEffect } from 'react';
import api from '../api';

interface Transfer {
  id: string;
  transferNumber: string;
  transferDate: string;
  status: string;
  notes: string | null;
  sourceBranch: { name: string };
  destinationBranch: { name: string };
  creator: { fullName: string };
  receiver?: { fullName: string } | null;
  receivedAt: string | null;
  _count?: { items: number };
}

interface Branch { id: string; name: string; }
interface Product { id: string; name: string; }

export default function Transfers() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sourceBranchId: '', destinationBranchId: '', transferDate: new Date().toISOString().split('T')[0], notes: '' });
  const [items, setItems] = useState([{ productId: '', quantity: 1 }]);

  useEffect(() => { loadTransfers(); loadBranches(); loadProducts(); }, []);

  const loadTransfers = async () => {
    try {
      const { data } = await api.get('/transfers', { params: { limit: 50 } });
      setTransfers(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadBranches = async () => {
    try {
      const { data } = await api.get('/branches');
      setBranches(data.data || []);
    } catch (err) {}
  };

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', { params: { limit: 200 } });
      setProducts(data.data || []);
    } catch (err) {}
  };

  const addItem = () => setItems([...items, { productId: '', quantity: 1 }]);
  const removeItem = (i: number) => { if (items.length > 1) setItems(items.filter((_, idx) => idx !== i)); };
  const updateItem = (i: number, field: string, value: any) => setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const handleCreate = async () => {
    if (!form.sourceBranchId || !form.destinationBranchId) { alert('Select source and destination branches'); return; }
    if (form.sourceBranchId === form.destinationBranchId) { alert('Source and destination must differ'); return; }
    const validItems = items.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) { alert('Add at least one item'); return; }
    try {
      setSaving(true);
      // API requires an ISO datetime string for transferDate.
      const transferDate = form.transferDate
        ? new Date(`${form.transferDate}T00:00:00.000Z`).toISOString()
        : new Date().toISOString();
      await api.post('/transfers', { ...form, transferDate, items: validItems });
      setShowCreate(false);
      setItems([{ productId: '', quantity: 1 }]);
      setForm({ sourceBranchId: '', destinationBranchId: '', transferDate: new Date().toISOString().split('T')[0], notes: '' });
      loadTransfers();
    } catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const approveTransfer = async (id: string) => {
    if (!confirm('Approve this transfer?')) return;
    try { await api.post(`/transfers/${id}/approve`); loadTransfers(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  const receiveTransfer = async (id: string) => {
    if (!confirm('Receive this transfer? Stock will be updated.')) return;
    try { await api.post(`/transfers/${id}/receive`); loadTransfers(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  const cancelTransfer = async (id: string) => {
    if (!confirm('Cancel this transfer?')) return;
    try { await api.post(`/transfers/${id}/cancel`); loadTransfers(); }
    catch (err: any) { alert(err.response?.data?.error?.message || 'Failed'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Stock Transfers</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{transfers.length} transfer{transfers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+ New Transfer</button>
      </div>

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Transfer #</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>From → To</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Created By</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No transfers yet</td></tr>
            ) : (
              transfers.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{t.transferNumber}</td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{new Date(t.transferDate).toLocaleDateString()}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{t.sourceBranch?.name} → {t.destinationBranch?.name}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{t.creator?.fullName}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: t.status === 'RECEIVED' ? '#f0fdf4' : t.status === 'DRAFT' ? '#fef3c7' : t.status === 'IN_TRANSIT' ? '#eff6ff' : '#fef2f2',
                      color: t.status === 'RECEIVED' ? '#16a34a' : t.status === 'DRAFT' ? '#d97706' : t.status === 'IN_TRANSIT' ? '#2563eb' : '#dc2626',
                    }}>{t.status}</span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {t.status === 'DRAFT' && <>
                        <button onClick={() => approveTransfer(t.id)} style={{ padding: '4px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => cancelTransfer(t.id)} style={{ padding: '4px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                      </>}
                      {t.status === 'IN_TRANSIT' && <button onClick={() => receiveTransfer(t.id)} style={{ padding: '4px 8px', background: '#059669', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Receive</button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 700, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>New Stock Transfer</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>From Branch *</label>
                <select value={form.sourceBranchId} onChange={(e) => setForm({ ...form, sourceBranchId: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                  <option value="">Select</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>To Branch *</label>
                <select value={form.destinationBranchId} onChange={(e) => setForm({ ...form, destinationBranchId: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                  <option value="">Select</option>
                  {branches.filter(b => b.id !== form.sourceBranchId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <select value={item.productId} onChange={(e) => updateItem(i, 'productId', e.target.value)} style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}>
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" step="0.01" min="0.01" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)} style={{ width: 80, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
                {items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>×</button>}
              </div>
            ))}
            <button onClick={addItem} style={{ width: '100%', padding: '8px', background: '#f3f4f6', border: '1px dashed #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>+ Add Item</button>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: '10px 20px', background: saving ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Creating...' : 'Create Transfer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
