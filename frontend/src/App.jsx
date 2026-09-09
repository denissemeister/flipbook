import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useCustomerStore, setCustomerToken } from './stores/customerStore';
import { api } from './api/client';
import LoginPage from './pages/LoginPage';
import LibraryPage from './pages/LibraryPage';
import EditorPage from './pages/EditorPage';
import CustomerLoginPage from './pages/CustomerLoginPage';
import OrdersPage from './pages/OrdersPage';
import ReadAloudPage from './pages/ReadAloudPage';
import ReadAloudReaderPage from './pages/ReadAloudReaderPage';
import ViewerPage from './pages/ViewerPage';
import PersonalizePage from './pages/PersonalizePage';
import SettingsPage from './pages/SettingsPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import StorePage from './pages/StorePage';
import CartPage from './pages/CartPage';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage';
import AdminProductsPage from './pages/AdminProductsPage';

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function CustomerRoute({ children }) {
  const token = useCustomerStore(s => s.token);
  return token ? children : <Navigate to="/account/login" replace />;
}

export default function App() {
  const { login } = useAuthStore();
  const { login: customerLogin } = useCustomerStore();
  const [booting, setBooting] = useState(true);

  // Silently restore both admin and customer sessions on page load.
  useEffect(() => {
    const adminRefresh = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ accessToken, admin }) => login(accessToken, admin))
      .catch(() => {});

    const customerRefresh = fetch('/api/v1/customer/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ accessToken, customer }) => customerLogin(accessToken, customer))
      .catch(() => {});

    Promise.allSettled([adminRefresh, customerRefresh]).finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', color:'var(--muted)', fontSize:13 }}>
        Loading…
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Admin routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin" element={<PrivateRoute><LibraryPage /></PrivateRoute>} />
        <Route path="/admin/books/:id/edit" element={<PrivateRoute><EditorPage /></PrivateRoute>} />
        <Route path="/admin/books/:id/read-aloud" element={<PrivateRoute><ReadAloudPage /></PrivateRoute>} />
        <Route path="/admin/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />

        {/* Public routes — no auth required */}
        <Route path="/read/:slug/aloud" element={<ReadAloudReaderPage />} />
        <Route path="/view/:slug" element={<ViewerPage />} />

        {/* Store — public */}
        <Route path="/store" element={<StorePage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />

        {/* Store — customer auth */}
        <Route path="/store/cart" element={<CustomerRoute><CartPage /></CustomerRoute>} />

        {/* Customer routes */}
        <Route path="/account/login" element={<CustomerLoginPage />} />
        <Route path="/account/orders" element={<CustomerRoute><OrdersPage /></CustomerRoute>} />
        <Route path="/personalize/:orderItemId/:slug" element={<CustomerRoute><PersonalizePage /></CustomerRoute>} />

        {/* Admin store management */}
        <Route path="/admin/store" element={<PrivateRoute><AdminProductsPage /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/store" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
