import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';

// Pages
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import CrawlPage from './pages/CrawlPage';
import DashboardPage from './pages/DashboardPage';
import GuardrailsPage from './pages/GuardrailsPage';
import ChatPage from './pages/ChatPage';
import OrdersPage from './pages/OrdersPage';
import AuditDetailPage from './pages/AuditDetailPage';
import HITLPage from './pages/HITLPage';
import ReliabilityPage from './pages/ReliabilityPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminMerchantDetail from './pages/AdminMerchantDetail';
import CatalogPage from './pages/CatalogPage';
import PaymentResultPage from './pages/PaymentResultPage';
import ProfilePage from './pages/ProfilePage';

import './index.css';

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && user?.role !== requiredRole) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: 240 }}>{children}</div>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={isAuthenticated ? <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} /> : <LoginPage />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to="/crawl" /> : <SignupPage />} />
      <Route path="/payment/result" element={<PaymentResultPage />} />

      {/* Merchant routes */}
      <Route path="/dashboard" element={<ProtectedRoute requiredRole="merchant"><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      <Route path="/crawl" element={<ProtectedRoute requiredRole="merchant"><CrawlPage /></ProtectedRoute>} />
      <Route path="/catalog" element={<ProtectedRoute requiredRole="merchant"><AppLayout><CatalogPage /></AppLayout></ProtectedRoute>} />
      <Route path="/guardrails" element={<ProtectedRoute requiredRole="merchant"><AppLayout><GuardrailsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute requiredRole="merchant"><AppLayout><ChatPage /></AppLayout></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute requiredRole="merchant"><AppLayout><OrdersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/orders/:orderId/audit" element={<ProtectedRoute><AppLayout><AuditDetailPage /></AppLayout></ProtectedRoute>} />
      <Route path="/hitl" element={<ProtectedRoute requiredRole="merchant"><AppLayout><HITLPage /></AppLayout></ProtectedRoute>} />
      <Route path="/reliability" element={<ProtectedRoute requiredRole="merchant"><AppLayout><ReliabilityPage /></AppLayout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute requiredRole="merchant"><AppLayout><ProfilePage /></AppLayout></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminDashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/admin/merchants" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminDashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/admin/merchants/:merchantId" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminMerchantDetail /></AppLayout></ProtectedRoute>} />

      {/* Root redirect */}
      <Route path="/" element={<Navigate to={isAuthenticated ? (user?.role === 'admin' ? '/admin' : '/dashboard') : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1F2937',
              color: '#F9FAFB',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
