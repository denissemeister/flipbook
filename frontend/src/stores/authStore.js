import { create } from 'zustand';
import { setToken } from '../api/client';

export const useAuthStore = create((set) => ({
  admin: null,
  token: null,

  login: (token, admin) => {
    setToken(token);
    set({ token, admin });
  },

  logout: () => {
    setToken(null);
    set({ token: null, admin: null });
  },
}));
