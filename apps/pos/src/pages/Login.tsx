import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { IconLock, IconUser, IconAlertTriangle, IconBarcode, IconCheckCircle } from '../components/Icons';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    navigate('/pos');
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/pos');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillCashierDemo = () => {
    setUsername('cashier1');
    setPassword('Cashier@123');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: 20,
      }}
    >
      <div
        className="modal-animate"
        style={{
          background: '#ffffff',
          padding: '36px 32px',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-modal)',
          width: '100%',
          maxWidth: 420,
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: 'var(--primary)',
              borderRadius: 12,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
            }}
          >
            <IconBarcode size={26} color="#ffffff" />
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', marginBottom: 4, letterSpacing: -0.5 }}>
            Beverage POS Terminal
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Cashier Shift & Terminal Sign In
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Cashier Username
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: '#f8fafc',
              }}
            >
              <IconUser size={16} color="#64748b" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter operator username"
                required
                autoFocus
                style={{
                  border: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: 14,
                  color: 'var(--text-main)',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Terminal Password
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: '#f8fafc',
              }}
            >
              <IconLock size={16} color="#64748b" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter operator password"
                required
                style={{
                  border: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: 14,
                  color: 'var(--text-main)',
                }}
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 16,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <IconAlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#cbd5e1' : 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
              marginBottom: 16,
            }}
          >
            {loading ? 'Authenticating...' : 'Open Terminal Session'}
          </button>
        </form>

        <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={fillCashierDemo}
            style={{
              fontSize: 12,
              color: 'var(--primary)',
              background: 'transparent',
              fontWeight: 600,
            }}
          >
            Fill Demo Cashier Credentials
          </button>
        </div>
      </div>
    </div>
  );
}
