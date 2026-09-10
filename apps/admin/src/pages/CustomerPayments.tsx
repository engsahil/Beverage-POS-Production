import { useState, useEffect } from 'react';
import api from '../api';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  currentBalance: number;
  creditLimit: number;
}

interface Payment {
  id: string;
  customerId: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  customer: { name: string };
}

export default function CustomerPayments() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    customerId: '',
    amount: 0,
    paymentMethod: 'CASH',
    referenceNumber: '',
    notes: '',
  });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [custRes, payRes] = await Promise.all([
        api.get('/customers', { params: { hasBalance: true } }),
        api.get('/customer-payments', { params: { limit: 50 } }),
      ]);
      setCustomers(custRes.data.data || []);
      setPayments(payRes.data.data || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
    setForm({ ...form, customerId });
  };

  const handleSubmit = async () => {
    if (!form.customerId || form.amount <= 0) {
      alert('Please select a customer and enter a valid amount');
      return;
    }

    const balance = Number(selectedCustomer?.currentBalance ?? 0);
    if (selectedCustomer && form.amount > balance) {
      if (!confirm(`Payment amount (Rs. ${form.amount.toFixed(2)}) exceeds customer balance (Rs. ${balance.toFixed(2)}). Continue?`)) {
        return;
      }
    }

    try {
      setProcessing(true);
      await api.post('/customer-payments', {
        ...form,
        referenceNumber: form.referenceNumber || null,
        notes: form.notes || null,
      });
      setShowForm(false);
      setForm({ customerId: '', amount: 0, paymentMethod: 'CASH', referenceNumber: '', notes: '' });
      setSelectedCustomer(null);
      loadData();
      alert('Payment recorded successfully');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to record payment');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Customer Payments</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>Record payments from customers with outstanding balances</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          + Record Payment
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Customers with Balance */}
        <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>Customers with Balance</h2>
          {customers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 14 }}>
              No customers with outstanding balance
            </div>
          ) : (
            <div style={{ maxHeight: 600, overflow: 'auto' }}>
              {customers.map(customer => (
                <div key={customer.id} style={{ padding: 12, borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => { setSelectedCustomer(customer); setForm({ ...form, customerId: customer.id }); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{customer.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{customer.phone || 'No phone'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>Rs. {Number(customer.currentBalance).toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Limit: Rs. {Number(customer.creditLimit).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>Recent Payments</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Date</th>
                <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Customer</th>
                <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Method</th>
                <th style={{ padding: 10, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No payments recorded yet</td></tr>
              ) : (
                payments.map(payment => (
                  <tr key={payment.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10, fontSize: 13, color: '#6b7280' }}>{new Date(payment.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: 10, fontSize: 14 }}>{payment.customer.name}</td>
                    <td style={{ padding: 10, fontSize: 13 }}>{payment.paymentMethod}</td>
                    <td style={{ padding: 10, fontSize: 14, textAlign: 'right', fontWeight: 600, color: '#059669' }}>Rs. {Number(payment.amount).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 500, width: '90%' }}>
            <h2 style={{ fontSize: 20, marginBottom: 20 }}>Record Customer Payment</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Customer *</label>
              <select value={form.customerId} onChange={(e) => handleCustomerSelect(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} - Balance: Rs. {Number(c.currentBalance).toFixed(2)}</option>)}
              </select>
            </div>

            {selectedCustomer && (
              <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Current Balance:</span>
                  <span style={{ fontWeight: 600, color: '#dc2626' }}>Rs. {Number(selectedCustomer.currentBalance).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                  <span>Credit Limit:</span>
                  <span style={{ fontWeight: 600 }}>Rs. {Number(selectedCustomer.creditLimit).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Payment Amount *</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Payment Method *</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Reference Number</label>
              <input type="text" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} placeholder="Optional" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setSelectedCustomer(null); }} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={processing || !form.customerId || form.amount <= 0} style={{ padding: '10px 20px', background: (processing || !form.customerId || form.amount <= 0) ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {processing ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
