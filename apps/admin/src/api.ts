import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminAccessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('adminRefreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });
        
        localStorage.setItem('adminAccessToken', data.data.accessToken);
        localStorage.setItem('adminRefreshToken', data.data.refreshToken);
        
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('adminAccessToken');
        localStorage.removeItem('adminRefreshToken');
        localStorage.removeItem('adminUser');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Dev-only diagnostics: endpoint + status + backend message (no secrets).
    if (import.meta.env.DEV) {
      console.error(
        '[API]',
        originalRequest?.method?.toUpperCase(),
        originalRequest?.url,
        '→',
        error.response?.status ?? 'NETWORK_ERROR',
        error.response?.data?.error?.message || error.message
      );
    }

    return Promise.reject(error);
  }
);

export default api;
