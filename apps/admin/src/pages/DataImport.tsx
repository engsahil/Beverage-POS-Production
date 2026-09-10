import { useState, useEffect } from 'react';
import api from '../api';
import {
  IconUpload,
  IconDownload,
  IconDocumentText,
  IconCheckCircle,
  IconAlertTriangle,
} from '../components/Icons';

interface ImportOp {
  id: string;
  entityType: string;
  fileName: string;
  status: string;
  totalRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
  createdCount: number | null;
  createdAt: string;
}

export default function DataImport() {
  const [imports, setImports] = useState<ImportOp[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('PRODUCT');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadImports();
  }, []);

  const loadImports = async () => {
    try {
      const { data } = await api.get('/data/imports');
      setImports(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Please choose a file to import');
      return;
    }
    try {
      setUploading(true);
      setMessage('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      const { data } = await api.post('/data/import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage(
        `File validated: ${data.data?.totalRows || '?'} rows parsed, ${data.data?.validRows || 0} valid, ${data.data?.invalidRows || 0} invalid.`
      );
      setFile(null);
      loadImports();
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Import upload failed');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async (type: string) => {
    try {
      const { data } = await api.get(`/data/templates/${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type.toLowerCase()}_import_template.csv`;
      a.click();
    } catch (err) {
      alert('Failed to generate template CSV');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-subtle)' }}>
        Loading import workflows...
      </div>
    );
  }

  const templateTypes = [
    { key: 'PRODUCT', label: 'Products & SKUs', desc: 'Catalog, pricing, barcode, tax rates' },
    { key: 'CUSTOMER', label: 'Customers', desc: 'Account names, phone, credit limits' },
    { key: 'VENDOR', label: 'Vendors / Suppliers', desc: 'Supplier company details & terms' },
    { key: 'CATEGORY', label: 'Categories', desc: 'Hierarchy and classification groups' },
    { key: 'UNIT', label: 'Measurement Units', desc: 'Cases, packs, bottles, liters' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-main)', letterSpacing: -0.4 }}>
          Data Import & Templates
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginTop: 2 }}>
          Bulk import products, customer accounts, and master data via verified CSV templates
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Upload Card */}
        <div
          style={{
            background: 'var(--color-surface)',
            padding: 24,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconUpload size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-main)' }}>Upload Spreadsheet</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>Supports CSV, XLSX up to 10MB</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Target Entity
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  background: '#ffffff',
                }}
              >
                <option value="PRODUCT">Products & Pricing</option>
                <option value="CUSTOMER">Customer Directory</option>
                <option value="VENDOR">Vendors / Distributors</option>
                <option value="CATEGORY">Category Groups</option>
                <option value="UNIT">Units of Measure</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Select File
              </label>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px dashed var(--color-border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  background: '#f8fafc',
                }}
              />
            </div>

            {message && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: message.toLowerCase().includes('failed') ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
                  color: message.toLowerCase().includes('failed') ? 'var(--color-danger)' : 'var(--color-success)',
                  border: message.toLowerCase().includes('failed') ? '1px solid var(--color-danger-border)' : '1px solid var(--color-success-border)',
                }}
              >
                {message.toLowerCase().includes('failed') ? <IconAlertTriangle size={15} /> : <IconCheckCircle size={15} />}
                <span>{message}</span>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: uploading || !file ? '#cbd5e1' : 'var(--color-primary)',
                color: '#ffffff',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                cursor: uploading || !file ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <IconUpload size={15} />
              <span>{uploading ? 'Validating Batch...' : 'Upload & Process Batch'}</span>
            </button>
          </div>
        </div>

        {/* Download Templates Card */}
        <div
          style={{
            background: 'var(--color-surface)',
            padding: 24,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: 'var(--color-info-bg)',
                color: 'var(--color-info)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconDocumentText size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-main)' }}>Standard Formats</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>Download pre-formatted sample sheets</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templateTypes.map((t) => (
              <button
                key={t.key}
                onClick={() => downloadTemplate(t.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  transition: 'background 0.12s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#e2e8f0')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 2 }}>{t.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
                  <IconDownload size={14} />
                  <span>CSV</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-main)' }}>Recent Batch Imports</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Type</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>File Name</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Parsed Rows</th>
              <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {imports.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-light)' }}>
                  No bulk import operations on record
                </td>
              </tr>
            ) : (
              imports.map((imp) => (
                <tr key={imp.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--color-text-muted)' }} className="mono">
                    {new Date(imp.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)' }}>
                    {imp.entityType}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {imp.fileName}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 12, textAlign: 'center', color: 'var(--color-text-muted)' }} className="mono">
                    {imp.totalRows || 0} total ({imp.validRows || 0} valid, {imp.invalidRows || 0} invalid)
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: imp.status === 'COMPLETED' ? 'var(--color-success-bg)' : imp.status === 'FAILED' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                        color: imp.status === 'COMPLETED' ? 'var(--color-success)' : imp.status === 'FAILED' ? 'var(--color-danger)' : 'var(--color-warning)',
                        border: imp.status === 'COMPLETED' ? '1px solid var(--color-success-border)' : imp.status === 'FAILED' ? '1px solid var(--color-danger-border)' : '1px solid var(--color-warning-border)',
                      }}
                    >
                      {imp.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
