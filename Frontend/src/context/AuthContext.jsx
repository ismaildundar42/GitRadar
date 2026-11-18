import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginApi, entraLoginApi } from '../api/gitRadarApi';

const TOKEN_KEY = 'gitradar_token';
const USER_KEY = 'gitradar_user';

export const DEMO_ACCOUNTS = {
  ADMIN: {
    email: 'admin@example.com',
    password: 'AdminPass123!',
    name: 'GitRadar Administrator',
    role: 'Admin',
    badge: 'Admin',
    department: 'Enterprise Cyber Security',
  },
  AUDITOR: {
    email: 'admin@example.com',
    password: 'AdminPass123!',
    name: 'GitRadar Auditor',
    role: 'Admin',
    badge: 'Admin',
    department: 'Security & Compliance Audit',
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem(USER_KEY);
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  // Oturum durumunu localStorage ile senkronize et
  useEffect(() => {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }

      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      // localStorage erişim hatası
    }
  }, [token, user]);

  // Axios response interceptor'ından gelen 401 logout olayını dinle
  useEffect(() => {
    const handleUnauthorizedLogout = () => {
      setToken(null);
      setUser(null);
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {}
    };

    window.addEventListener('gitradar-auth-logout', handleUnauthorizedLogout);
    return () => {
      window.removeEventListener('gitradar-auth-logout', handleUnauthorizedLogout);
    };
  }, []);

  /**
   * Kurumsal kullanıcı girişi
   * Backend POST /api/auth/login endpoint'ine istek atar
   */
  const login = async (email, password) => {
    try {
      const data = await loginApi(email, password);

      const authUser = {
        email: data.email,
        name: data.fullName || data.email,
        role: data.role,
        badge: data.role === 'Admin' ? 'Admin' : 'Denetçi',
        department:
          data.role === 'Admin'
            ? 'Enterprise Cyber Security'
            : 'Security & Compliance Audit',
        expiration: data.expiration,
      };

      setToken(data.token);
      setUser(authUser);

      try {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(authUser));
      } catch {}

      return { success: true, user: authUser };
    } catch (err) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        'Giriş yapılamadı. Lütfen bilgilerinizi kontrol edin.';

      return { success: false, error: errorMessage };
    }
  };

  /**
   * Microsoft Entra ID (Azure AD) SSO ile Giriş
   * Backend Pre-Authorized Whitelist (dbo.AspNetUsers) kontrolünden geçer.
   */
  const loginWithEntra = async ({ code, redirectUri, idToken }) => {
    try {
      const data = await entraLoginApi({ code, redirectUri, idToken });

      const authUser = {
        email: data.email,
        name: data.fullName || data.email,
        role: data.role,
        badge: data.role === 'Admin' ? 'Admin' : 'Denetçi',
        department:
          data.role === 'Admin'
            ? 'Enterprise Cyber Security'
            : 'Security & Compliance Audit',
        expiration: data.expiration,
        isSso: true,
      };

      setToken(data.token);
      setUser(authUser);

      try {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(authUser));
      } catch {}

      return { success: true, user: authUser };
    } catch (err) {
      const isForbidden = err?.response?.status === 403;
      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        (isForbidden
          ? 'Bu kurumsal hesap GitRadar erişimi için yetkilendirilmemiştir. Lütfen sistem yöneticisiyle iletişime geçin.'
          : 'Microsoft Entra ID girişi başarısız oldu.');

      return { success: false, error: errorMessage, isForbidden };
    }
  };

  /**
   * Microsoft Entra ID Hızlı Geçiş (Bypass / Demo)
   */
  const loginWithEntraBypass = async () => {
    return await login('admin@example.com', 'AdminPass123!');
  };

  /**
   * Hızlı Demo / Tek Tık Giriş Kolaylığı
   */
  const loginAs = async (role) => {
    if (role === 'Admin') {
      return await login(DEMO_ACCOUNTS.ADMIN.email, DEMO_ACCOUNTS.ADMIN.password);
    } else {
      return await login(DEMO_ACCOUNTS.AUDITOR.email, DEMO_ACCOUNTS.AUDITOR.password);
    }
  };

  /**
   * Güvenli Oturum Kapatma
   */
  const logout = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  };

  const value = {
    token,
    user,
    login,
    loginAs,
    loginWithEntra,
    loginWithEntraBypass,
    logout,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.role === 'Admin',
    isAuditor: user?.role === 'Viewer',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
