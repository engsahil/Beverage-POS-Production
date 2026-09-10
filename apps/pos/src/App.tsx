import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import POS from './pages/POS';
import OfflineQueue from './pages/OfflineQueue';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  return user ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pos" element={<PrivateRoute><POS /></PrivateRoute>} />
          <Route path="/offline-queue" element={<PrivateRoute><OfflineQueue /></PrivateRoute>} />
          <Route path="/" element={<Navigate to="/pos" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
