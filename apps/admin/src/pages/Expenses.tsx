import { useState, useEffect } from 'react';
import api from '../api';

interface Expense {
  id: string;
  expenseNumber: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  status: string;
  category: { name: string };
  createdAt: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    categoryId: '',
    description: '',
    amount: 0,
    paymentMethod: 'CASH',
    expenseDate: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    notes: '',
  });
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    loadExpenses();
    loadCategories();
  }, []);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/expenses', { params: { limit: 100 } });
      setExpenses(data.data || []);
    } catch (err: any) {
      setError('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data } = await api.get('/expense-categories');
      setCategories(data.data || []);
    } catch (err) {}
  };

  const handleCreate = async () => {
    if (!form.categoryId || !form.description || form.amount <= 0) {
      alert('Please fill in all required fields');
      return;
    }
    try {
      setCreating(true);
      await api.post('/expenses', form);
      setShowCreateModal(false);
      setForm({ categoryId: '', description: '', amount: 0, paymentMethod: 'CASH', expenseDate: new Date().toISOString().split('T')[0], referenceNumber: '', notes: '' });
      loadExpenses();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create expense');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory) return;
    try {
      await api.post('/expense-categories', { name: newCategory });
      setNewCategory('');
      setShowCategoryModal(false);
      loadCategories();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create category');
    }
  };

  const cancelExpense = async (id: string) => {
    const reason = prompt('Reason for cancellation:');
    if (!reason) return;
    try {
      await api.post(`/expenses/${id}/cancel`, { reason });
      loadExpenses();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to cancel expense');
    }
  };

  const totalExpenses = expenses.filter(e => e.status === 'ACTIVE').reduce((sum, e) => sum + Number(e.amount), 0);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading expenses...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Expenses</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>Total: Rs. {totalExpenses.toFixed(2)} ({expenses.length} records)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCategoryModal(true)} style={{ padding: '10px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Categories
          </button>
          <button onClick={() => setShowCreateModal(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            + Add Expense
          </button>
        </div>
      </div>

      {error && <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #dc2626', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>{error}</div>}

      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Category</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Description</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Amount</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Method</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No expenses found</td></tr>
            ) : (
              expenses.map(exp => (
                <tr key={exp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{new Date(exp.expenseDate).toLocaleDateString()}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{exp.category?.name}</td>
                  <td style={{ padding: 12, fontSize: 14 }}>{exp.description}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>Rs. {Number(exp.amount).toFixed(2)}</td>
                  <td style={{ padding: 12, fontSize: 13, textAlign: 'center' }}>{exp.paymentMethod}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: exp.status === 'ACTIVE' ? '#f0fdf4' : '#fef2f2',
                      color: exp.status === 'ACTIVE' ? '#16a34a' : '#dc2626',
                    }}>{exp.status}</span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {exp.status === 'ACTIVE' && (
                      <button onClick={() => cancelExpense(exp.id)} style={{ padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Expense Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 500, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 20, marginBottom: 20, color: '#1f2937' }}>Add Expense</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Category *</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                <option value="">Select Category</option>
                {categories.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Description *</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Amount *</label>
                <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Date</label>
                <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={creating} style={{ padding: '10px 20px', background: creating ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer' }}>{creating ? 'Creating...' : 'Add Expense'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 20, marginBottom: 20, color: '#1f2937' }}>Expense Categories</h2>
            <div style={{ marginBottom: 16, maxHeight: 300, overflow: 'auto' }}>
              {categories.map(c => (
                <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14 }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: c.isActive ? '#16a34a' : '#dc2626' }}>{c.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              <button onClick={handleCreateCategory} style={{ padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Add</button>
            </div>
            <button onClick={() => setShowCategoryModal(false)} style={{ width: '100%', padding: '10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
