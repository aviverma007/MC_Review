import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api';

const AppCtx = createContext(null);

const ROLE_LABEL = {
  user: 'User',
  revMEP: 'Reviewer — MEP & Procurement',
  revCIV: 'Reviewer — Civil & Consultancy',
  admin: 'Admin',
};

export function AppProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('mc_token') || null);
  const [user, setUser] = useState(null); // { loginId, displayName, role, mustChangePassword }
  // Tell the IT Manager usage tracker (index.html) who is signed in
  useEffect(() => { window.ITM_USER = user ? (user.loginId || user.displayName || '') : ''; }, [user]);
  const [authLoading, setAuthLoading] = useState(true);
  const [reference, setReference] = useState(null);

  const logout = useCallback(() => {
    localStorage.removeItem('mc_token');
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('mc_token', newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  // Re-validate the token on load (also picks up mustChangePassword / role
  // changes an admin made since the token was issued, within its 12h life).
  useEffect(() => {
    if (!token) { setAuthLoading(false); return; }
    api.authMe()
      .then((u) => setUser(u))
      .catch(() => logout())
      .finally(() => setAuthLoading(false));
  }, [token]);

  useEffect(() => {
    if (!user) return;
    api.reference().then(setReference).catch(() => {});
  }, [user]);

  // Re-read the account (after a password change, role change, etc.).
  const refreshUser = useCallback(async () => {
    try { const u = await api.authMe(); setUser(u); return u; } catch { return null; }
  }, []);

  const role = user?.role || null;

  const value = {
    token, user, authLoading, login, logout, refreshUser, setUser,
    role, roleLabel: role ? ROLE_LABEL[role] : null, ROLE_LABEL,
    reference,
    isReviewerish: role !== 'user',
    reviewerIndex: role === 'revMEP' ? 'MEP' : role === 'revCIV' ? 'CIVIL' : null,
    isAdmin: role === 'admin',
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
