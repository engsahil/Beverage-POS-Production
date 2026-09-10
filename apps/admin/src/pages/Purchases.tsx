import { useState, useEffect } from 'react';
import api from '../api';

interface Purchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  status: string;
  vendor: { name: string };
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentStatus: string;
  items?: any[];
}

interface Vendor {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  purchasePrice: number;
}

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState([{ productId: '', quantity: 1, purchasePrice: 0 }]);
  const [form, setForm] = useState({
    vendorId: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    loadPurchases();
    loadVendors();
    loadProducts();
  }, []);

  const loadPurchases = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/purchases', { params: { limit: 100 } });
      setPurchases(data.data || []);
    } catch (err: any) {
      setError('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  const loadVendors = async () => {
    try {
      const { data } = await api.get('/vendors', { params: { limit: 100 } });
      setVendors(data.data || []);
    } catch (err) {}
  };

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', { params: { limit: 200 } });
      setProducts(data.data || []);
    } catch (err) {}
  };

  const addItem = () => {
    setPurchaseItems([...purchaseItems, { productId: '', quantity: 1, purchasePrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (purchaseItems.length > 1) {
      setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    setPurchaseItems(purchaseItems.map((item, i) => {
      if (i === index) {
        if (field === 'productId') {
          const product = products.find(p => p.id === value);
          return { ...item, productId: value, purchasePrice: product?.purchasePrice || 0 };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleCreate = async () => {
    if (!form.vendorId) {
      alert('Please select a vendor');
      return;
    }
    const validItems = purchaseItems.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      alert('Please add at least one item');
      return;
    }

    try {
      setCreating(true);
      await api.post('/purchases', {
        vendorId: form.vendorId,
        purchaseDate: form.purchaseDate,
        notes: form.notes,
        items: validItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          purchasePrice: i.purchasePrice,
        })),
      });
      setShowCreateModal(false);
      setPurchaseItems([{ productId: '', quantity: 1, purchasePrice: 0 }]);
      setForm({ vendorId: '', purchaseDate: new Date().toISOString().split('T')[0], notes: '' });
      loadPurchases();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create purchase');
    } finally {
      setCreating(false);
    }
  };

  const receivePurchase = async (id: string) => {
    if (!confirm('Receive this purchase into inventory? This will update stock levels.')) return;
    try {
      await api.post(`/purchases/${id}/receive`);
      alert('Purchase received successfully');
      loadPurchases();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to receive purchase');
    }
  };

  const totalAmount = purchaseItems.reduce((sum, i) => sum + (i.quantity * i.purchasePrice), 0);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading purchases...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Purchases</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{purchases.length} purchase orders</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          + New Purchase
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #dc2626', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>PO #</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Vendor</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Total</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Payment</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No purchases found</td></tr>
            ) : (
              purchases.map(po => (
                <tr key={po.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{po.purchaseNumber}</td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{new Date(po.purchaseDate).toLocaleDateString()}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{po.vendor?.name}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600 }}>Rs. {Number(po.total).toFixed(2)}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      background: po.status === 'RECEIVED' ? '#f0fdf4' : po.status === 'DRAFT' ? '#fef3c7' : '#f3f4f6',
                      color: po.status === 'RECEIVED' ? '#16a34a' : po.status === 'DRAFT' ? '#d97706' : '#6b7280',
                    }}>
                      {po.status}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      background: po.paymentStatus === 'PAID' ? '#f0fdf4' : '#fef2f2',
                      color: po.paymentStatus === 'PAID' ? '#16a34a' : '#dc2626',
                    }}>
                      {po.paymentStatus}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {po.status === 'DRAFT' && (
                      <button
                        onClick={() => receivePurchase(po.id)}
                        style={{ padding: '4px 10px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Receive
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Purchase Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 28, maxWidth: 700, width: '90%', maxHeight: '90vh', overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 20, color: '#1f2937' }}>New Purchase Order</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Vendor *</label>
                <select
                  value={form.vendorId}
                  onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                >
                  <option value="">Select Vendor</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Date</label>
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <h3 style={{ fontSize: 16, marginBottom: 10, color: '#1f2937' }}>Items</h3>
            {purchaseItems.map((item, index) => (
              <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <select
                  value={item.productId}
                  onChange={(e) => updateItem(index, 'productId', e.target.value)}
                  style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                >
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                  style={{ width: 70, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                  placeholder="Qty"
                />
                <input
                  type="number"
                  step="0.01"
                  value={item.purchasePrice}
                  onChange={(e) => updateItem(index, 'purchasePrice', parseFloat(e.target.value) || 0)}
                  style={{ width: 90, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                  placeholder="Price"
                />
                {purchaseItems.length > 1 && (
                  <button onClick={() => removeItem(index)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>×</button>
                )}
              </div>
            ))}
            <button onClick={addItem} style={{ width: '100%', padding: '8px', background: '#f3f4f6', border: '1px dashed #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>
              + Add Item
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 6 }}>
              <span>Total:</span>
              <span style={{ color: '#dc2626' }}>Rs. {totalAmount.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} style={{ padding: '10px 20px', background: creating ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer' }}>
                {creating ? 'Creating...' : 'Create Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
