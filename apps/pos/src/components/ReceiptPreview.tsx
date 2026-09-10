import { useState, useEffect } from 'react';
import api from '../api';
import { IconPrinter, IconDownload, IconCheckCircle, IconAlertTriangle, IconReceipt } from './Icons';

interface ReceiptProps {
  saleId: string;
  onClose: () => void;
}

interface ReceiptData {
  sale: {
    id: string;
    saleNumber: string;
    saleDate: string;
    status: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    amountPaid: number;
    outstandingAmount: number;
    notes: string | null;
  };
  business: {
    name: string;
    address: string | null;
    phone: string | null;
    logo: string | null;
  };
  branch: {
    name: string;
  };
  cashier: {
    fullName: string;
  };
  customer: {
    name: string;
    phone: string | null;
  } | null;
  items: Array<{
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    total: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    referenceNumber: string | null;
  }>;
}

export default function ReceiptPreview({ saleId, onClose }: ReceiptProps) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    loadReceipt();
  }, [saleId]);

  const loadReceipt = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/receipts/${saleId}`);
      setReceipt(data.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to retrieve receipt data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const response = await api.get(`/receipts/${saleId}/pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        };
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PDF print pipeline error, triggering browser print:', err);
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await api.get(`/receipts/${saleId}/pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${receipt?.sale.saleNumber || saleId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to generate thermal receipt PDF');
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
      >
        <div style={{ background: '#ffffff', padding: '32px 48px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16 }}>Generating Sale Thermal Receipt...</div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--surface-subtle)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
      >
        <div style={{ background: '#ffffff', padding: 24, borderRadius: 'var(--radius-md)', maxWidth: 400 }}>
          <div style={{ color: 'var(--danger)', marginBottom: 16, fontSize: 13 }}>
            {error || 'Failed to load receipt'}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--primary)',
              color: '#ffffff',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Close Receipt View
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 20,
      }}
    >
      <div
        className="modal-animate"
        style={{
          background: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          maxWidth: 440,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconReceipt size={16} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>
              Fiscal Receipt #{receipt.sale.saleNumber}
            </h2>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: 'var(--text-muted)', background: 'transparent' }}>
            ×
          </button>
        </div>

        {/* Paper Thermal Receipt Simulator */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f1f5f9' }}>
          <div
            id="receipt-content"
            style={{
              fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
              fontSize: 11,
              lineHeight: 1.5,
              background: '#ffffff',
              padding: '24px 20px',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              color: '#0f172a',
            }}
          >
            {/* Business Header */}
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, textTransform: 'uppercase' }}>
                {receipt.business.name}
              </div>
              {receipt.business.address && <div style={{ fontSize: 10 }}>{receipt.business.address}</div>}
              {receipt.business.phone && <div style={{ fontSize: 10 }}>Tel: {receipt.business.phone}</div>}
            </div>

            <div style={{ borderTop: '1px dashed #94a3b8', margin: '10px 0' }} />

            {/* Sale Metadata */}
            <div style={{ fontSize: 10, lineHeight: 1.4, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bill #: {receipt.sale.saleNumber}</span>
                <span>{new Date(receipt.sale.saleDate).toLocaleTimeString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cashier: {receipt.cashier.fullName}</span>
                <span>Branch: {receipt.branch.name}</span>
              </div>
              {receipt.customer && (
                <div style={{ marginTop: 2, fontWeight: 600 }}>
                  Customer: {receipt.customer.name} {receipt.customer.phone ? `(${receipt.customer.phone})` : ''}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px dashed #94a3b8', margin: '10px 0' }} />

            {/* Line Items */}
            <div style={{ marginBottom: 10 }}>
              {receipt.items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{item.productName}</div>
                  {item.variantName && (
                    <div style={{ fontSize: 9, color: '#64748b' }}>Variant: {item.variantName}</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      {item.quantity} × Rs. {Number(item.unitPrice).toFixed(2)}
                    </span>
                    <span style={{ fontWeight: 600 }}>Rs. {Number(item.total).toFixed(2)}</span>
                  </div>
                  {item.discountAmount > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--danger)', textAlign: 'right' }}>
                      Discount: -Rs. {Number(item.discountAmount).toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px dashed #94a3b8', margin: '10px 0' }} />

            {/* Totals & Tax */}
            <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal</span>
                <span>Rs. {Number(receipt.sale.subtotal).toFixed(2)}</span>
              </div>
              {receipt.sale.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                  <span>Discounts</span>
                  <span>-Rs. {Number(receipt.sale.discountAmount).toFixed(2)}</span>
                </div>
              )}
              {receipt.sale.taxAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Sales Tax</span>
                  <span>+Rs. {Number(receipt.sale.taxAmount).toFixed(2)}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 800,
                  fontSize: 13,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: '1px solid #0f172a',
                }}
              >
                <span>GRAND TOTAL</span>
                <span>Rs. {Number(receipt.sale.total).toFixed(2)}</span>
              </div>
            </div>

            {/* Payments breakdown */}
            <div style={{ fontSize: 10, borderTop: '1px dashed #94a3b8', paddingTop: 8, marginBottom: 8 }}>
              {receipt.payments.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tendered ({p.method}):</span>
                  <span>Rs. {Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', fontSize: 10, color: '#64748b', marginTop: 12 }}>
              <div>Thank you for choosing {receipt.business.name}!</div>
              <div style={{ fontSize: 8, marginTop: 4 }}>Electronic POS Receipt Generated By BevPOS Terminal</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
            background: '#ffffff',
          }}
        >
          <button
            onClick={handlePrint}
            disabled={printing}
            style={{
              flex: 1,
              padding: '9px 12px',
              background: 'var(--primary)',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <IconPrinter size={14} />
            <span>{printing ? 'Printing...' : 'Print Thermal'}</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            style={{
              flex: 1,
              padding: '9px 12px',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <IconDownload size={14} />
            <span>PDF File</span>
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
