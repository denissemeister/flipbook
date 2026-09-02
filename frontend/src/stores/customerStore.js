import { create } from 'zustand';

let _customerToken = null;
export function setCustomerToken(t) { _customerToken = t; }
export function getCustomerToken()  { return _customerToken; }

export const useCustomerStore = create((set) => ({
  customer: null,
  token:    null,

  login: (token, customer) => {
    setCustomerToken(token);
    set({ token, customer });
  },

  logout: () => {
    setCustomerToken(null);
    set({ token: null, customer: null });
  },
}));
