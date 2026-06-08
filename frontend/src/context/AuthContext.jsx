import { createContext, useState, useEffect } from 'react';
import api from '../api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const res = await api.get('/auth/status');
        console.log(res.data)
        if (res.data.isAuthenticated) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        // Silent token refresh if access token is expired or missing
        try {
          console.log('Access token expired or missing. Attempting silent token refresh...');
          const refreshRes = await api.post('/auth/refresh');
          if (refreshRes.data.success) {
            const statusRes = await api.get('/auth/status');
            if (statusRes.data.isAuthenticated) {
              setIsAuthenticated(true);
              return;
            }
          }
        } catch (refreshErr) {
          console.error('Failed to refresh session:', refreshErr);
        }
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  const login = async (email, password) => {
    try {
      await api.post('/auth/login', { email, password });
      setIsAuthenticated(true);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error(err);
    } finally {
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
