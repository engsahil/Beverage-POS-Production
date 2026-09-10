import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api';

interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleId: string | null;
  roleName: string | null;
  branchId: string | null;
  branchName: string | null;
  businessId: string;
  businessName: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('adminUser');
    const token = localStorage.getItem('adminAccessToken');
    
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('adminUser');
        localStorage.removeItem('adminAccessToken');
        localStorage.removeItem('adminRefreshToken');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    
    const { accessToken, refreshToken, user: userData } = data.data;
    
    localStorage.setItem('adminAccessToken', accessToken);
    localStorage.setItem('adminRefreshToken', refreshToken);
    localStorage.setItem('adminUser', JSON.stringify(userData));
    
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('adminAccessToken');
    localStorage.removeItem('adminRefreshToken');
    localStorage.removeItem('adminUser');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
