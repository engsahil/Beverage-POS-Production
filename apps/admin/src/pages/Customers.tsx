import { useState, useEffect } from 'react';
import api from '../api';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: number;
  currentBalance: number;
  status: string;
  createdAt: string;
}

interface LedgerEntry {
  id: string;
  ledgerDate: string;
  referenceType: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  notes: string | null;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    creditLimit: 0,
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    paymentMethod: 'CASH',
    referenceNumber: '',
    notes: '',
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/customers', { params: { limit: 200 } });
      setCustomers(data.data || []);
    } catch (err: any) {
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newCustomer.name) {
      alert('Customer name is required');
      return;
    }

    try {
      setCreating(true);
      await api.post('/customers', newCustomer);
      setShowCreateModal(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '', creditLimit: 0 });
      loadCustomers();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create customer');
    } finally {
      setCreating(false);
    }
  };

  const viewLedger = async (customer: Customer) => {
    try {
      setSelectedCustomer(customer);
      const { data } = await api.get(`/customers/${customer.id}/ledger`, {
        params: { limit: 100 }
      });
      setLedgerEntries(data.data || []);
      setShowLedgerModal(true);
    } catch (err: any) {
      alert('Failed to load ledger');
    }
  };

  const recordPayment = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPaymentForm({ amount: 0, paymentMethod: 'CASH', referenceNumber: '', notes: '' });
    setShowPaymentModal(true);
  };

  const handlePayment = async () => {
    if (!selectedCustomer || paymentForm.amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      await api.post(`/customers/${selectedCustomer.id}/payments`, paymentForm);
      setShowPaymentModal(false);
      loadCustomers();
      alert('Payment recorded successfully');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to record payment');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>Loading customers...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1f2937', marginBottom: 4 }}>Customers</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>
            {customers.length} customer{customers.length !== 1 ? 's' : ''} registered
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
          }}
        >
          + Add Customer
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
          placeholder="Search customers..."
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
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Phone</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Credit Limit</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Balance</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                  {searchTerm ? 'No customers match your search' : 'No customers found. Add your first customer to get started.'}
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => (
                <tr key={customer.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontSize: 14, color: '#1f2937', fontWeight: 500 }}>{customer.name}</td>
                  <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{customer.phone || '-'}</td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', color: '#6b7280' }}>
                    Rs. {customer.creditLimit.toFixed(2)}
                  </td>
                  <td style={{ padding: 12, fontSize: 14, textAlign: 'right', fontWeight: 600, color: customer.currentBalance > 0 ? '#dc2626' : '#059669' }}>
                    Rs. {customer.currentBalance.toFixed(2)}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      background: customer.status === 'ACTIVE' ? '#f0fdf4' : '#fef2f2',
                      color: customer.status === 'ACTIVE' ? '#16a34a' : '#dc2626',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {customer.status}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => viewLedger(customer)}
                        style={{
                          padding: '4px 10px',
                          background: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Ledger
                      </button>
                      {customer.currentBalance > 0 && (
                        <button
                          onClick={() => recordPayment(customer)}
                          style={{
                            padding: '4px 10px',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Record Payment
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Customer Modal */}
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
            padding: 28,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 20, color: '#1f2937' }}>Add New Customer</h2>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Name *</label>
              <input
                type="text"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Phone</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Email</label>
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Address</label>
              <textarea
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Credit Limit</label>
              <input
                type="number"
                step="0.01"
                value={newCustomer.creditLimit}
                onChange={(e) => setNewCustomer({ ...newCustomer, creditLimit: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newCustomer.name}
                style={{
                  padding: '10px 20px',
                  background: creating || !newCustomer.name ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creating || !newCustomer.name ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? 'Creating...' : 'Create Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {showLedgerModal && selectedCustomer && (
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
            padding: 28,
            maxWidth: 800,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, color: '#1f2937', margin: 0 }}>Customer Ledger</h2>
                <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>{selectedCustomer.name}</p>
              </div>
              <button
                onClick={() => setShowLedgerModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}
              >
                ×
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Date</th>
                  <th style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Description</th>
                  <th style={{ padding: 10, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Debit</th>
                  <th style={{ padding: 10, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Credit</th>
                  <th style={{ padding: 10, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>
                      No ledger entries
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map(entry => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 10, fontSize: 13 }}>{new Date(entry.ledgerDate).toLocaleDateString()}</td>
                      <td style={{ padding: 10, fontSize: 13 }}>{entry.description}</td>
                      <td style={{ padding: 10, fontSize: 13, textAlign: 'right', color: entry.debit > 0 ? '#dc2626' : '#9ca3af' }}>
                        {entry.debit > 0 ? `Rs. ${entry.debit.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ padding: 10, fontSize: 13, textAlign: 'right', color: entry.credit > 0 ? '#059669' : '#9ca3af' }}>
                        {entry.credit > 0 ? `Rs. ${entry.credit.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ padding: 10, fontSize: 13, textAlign: 'right', fontWeight: 600 }}>
                        Rs. {entry.balance.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
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
            padding: 28,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: '#1f2937' }}>Record Payment</h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
              {selectedCustomer.name} - Current Balance: <strong style={{ color: '#dc2626' }}>Rs. {selectedCustomer.currentBalance.toFixed(2)}</strong>
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Amount *</label>
              <input
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Payment Method</label>
              <select
                value={paymentForm.paymentMethod}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Reference Number</label>
              <input
                type="text"
                value={paymentForm.referenceNumber}
                onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Notes</label>
              <textarea
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={paymentForm.amount <= 0}
                style={{
                  padding: '10px 20px',
                  background: paymentForm.amount <= 0 ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: paymentForm.amount <= 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
