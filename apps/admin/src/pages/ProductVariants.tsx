import { useState, useEffect } from 'react';
import api from '../api';

interface Variant {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  size: string | null;
  unitId: string | null;
  unit?: { name: string };
  costPrice: number;
  sellingPrice: number;
  isActive: boolean;
  currentStock?: number;
}

interface Product {
  id: string;
  name: string;
  variants: Variant[];
}

interface Unit {
  id: string;
  name: string;
}

export default function ProductVariants() {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    size: '',
    unitId: '',
    costPrice: 0,
    sellingPrice: 0,
    isActive: true,
  });

  useEffect(() => {
    loadProducts();
    loadUnits();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/products', { params: { include: 'variants,variants.unit' } });
      setProducts(data.data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUnits = async () => {
    try {
      const { data } = await api.get('/units');
      setUnits(data.data || []);
    } catch (err) {
      console.error('Failed to load units:', err);
    }
  };

  const handleSubmit = async () => {
    if (!selectedProduct) return;

    try {
      if (editingVariant) {
        await api.put(`/products/${selectedProduct.id}/variants/${editingVariant.id}`, form);
      } else {
        await api.post(`/products/${selectedProduct.id}/variants`, form);
      }
      setShowForm(false);
      setEditingVariant(null);
      setForm({ name: '', sku: '', barcode: '', size: '', unitId: '', costPrice: 0, sellingPrice: 0, isActive: true });
      loadProducts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to save variant');
    }
  };

  const handleEdit = (variant: Variant) => {
    setEditingVariant(variant);
    setForm({
      name: variant.name,
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      size: variant.size || '',
      unitId: variant.unitId || '',
      costPrice: Number(variant.costPrice),
      sellingPrice: Number(variant.sellingPrice),
      isActive: variant.isActive,
    });
    setShowForm(true);
  };

  const handleDelete = async (variantId: string) => {
    if (!selectedProduct || !confirm('Delete this variant?')) return;
    try {
      await api.delete(`/products/${selectedProduct.id}/variants/${variantId}`);
      loadProducts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to delete variant');
    }
  };

  const toggleActive = async (variantId: string, currentStatus: boolean) => {
    if (!selectedProduct) return;
    try {
      await api.patch(`/products/${selectedProduct.id}/variants/${variantId}`, { isActive: !currentStatus });
      loadProducts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update variant');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 8 }}>Product Variants</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>Manage product sizes, units, and pricing variations</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        {/* Product List */}
        <div style={{ background: 'white', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', maxHeight: '80vh', overflow: 'auto' }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Products</h2>
          {products.map(product => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                marginBottom: 4,
                background: selectedProduct?.id === product.id ? '#dc2626' : 'transparent',
                color: selectedProduct?.id === product.id ? 'white' : '#1f2937',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 500 }}>{product.name}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{product.variants?.length || 0} variants</div>
            </button>
          ))}
        </div>

        {/* Variants List */}
        <div>
          {selectedProduct ? (
            <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, marginBottom: 4 }}>{selectedProduct.name}</h2>
                  <p style={{ fontSize: 13, color: '#6b7280' }}>{selectedProduct.variants?.length || 0} variants</p>
                </div>
                <button
                  onClick={() => {
                    setEditingVariant(null);
                    setForm({ name: '', sku: '', barcode: '', size: '', unitId: '', costPrice: 0, sellingPrice: 0, isActive: true });
                    setShowForm(true);
                  }}
                  style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  + Add Variant
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Name</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>SKU</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Size</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Unit</th>
                    <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Cost</th>
                    <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Price</th>
                    <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
                    <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(!selectedProduct.variants || selectedProduct.variants.length === 0) ? (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No variants yet</td></tr>
                  ) : (
                    selectedProduct.variants.map(variant => (
                      <tr key={variant.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{variant.name}</td>
                        <td style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>{variant.sku || '-'}</td>
                        <td style={{ padding: 12, fontSize: 13 }}>{variant.size || '-'}</td>
                        <td style={{ padding: 12, fontSize: 13 }}>{variant.unit?.name || '-'}</td>
                        <td style={{ padding: 12, fontSize: 13, textAlign: 'right' }}>Rs. {Number(variant.costPrice).toFixed(2)}</td>
                        <td style={{ padding: 12, fontSize: 13, textAlign: 'right', fontWeight: 600 }}>Rs. {Number(variant.sellingPrice).toFixed(2)}</td>
                        <td style={{ padding: 12, textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            background: variant.isActive ? '#f0fdf4' : '#fef2f2',
                            color: variant.isActive ? '#16a34a' : '#dc2626',
                          }}>
                            {variant.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: 12, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button onClick={() => handleEdit(variant)} style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Edit</button>
                            <button onClick={() => toggleActive(variant.id, variant.isActive)} style={{ padding: '4px 10px', background: variant.isActive ? '#fef2f2' : '#f0fdf4', color: variant.isActive ? '#dc2626' : '#16a34a', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{variant.isActive ? 'Disable' : 'Enable'}</button>
                            <button onClick={() => handleDelete(variant.id)} style={{ padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: 8, padding: 60, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <p style={{ color: '#9ca3af', fontSize: 16 }}>Select a product to manage its variants</p>
            </div>
          )}
        </div>
      </div>

      {/* Variant Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 500, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 20 }}>{editingVariant ? 'Edit Variant' : 'Add Variant'}</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Variant Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Small, 500ml, Large" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>SKU</label>
                <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Barcode</label>
                <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Size</label>
                <input type="text" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g., 500ml, 1L" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Unit</label>
                <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                  <option value="">Select Unit</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Cost Price *</label>
                <input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Selling Price *</label>
                <input type="number" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span style={{ fontSize: 14 }}>Active</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingVariant(null); }} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={!form.name || form.costPrice <= 0 || form.sellingPrice <= 0} style={{ padding: '10px 20px', background: (!form.name || form.costPrice <= 0 || form.sellingPrice <= 0) ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{editingVariant ? 'Update' : 'Create'} Variant</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
