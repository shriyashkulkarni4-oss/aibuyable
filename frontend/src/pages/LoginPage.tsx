import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      login(res.access_token, res.merchant_id, res.role, res.name);
      navigate(res.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ width: 40, height: 40, background: 'var(--gradient-blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={22} color="#fff" />
            </div>
          </div>
          <h1>AIBuyable</h1>
          <p>Agentic Commerce Gateway for Razorpay Merchants</p>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--danger-red-glow)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <AlertCircle size={16} color="var(--danger-red)" />
            <span style={{ color: 'var(--danger-red)', fontSize: '0.875rem' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                id="login-email"
                type="email"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="merchant@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                id="login-password"
                type="password"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary w-full btn-lg"
            style={{ marginTop: '0.5rem', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? (
              <><span className="crawl-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Signing in...</>
            ) : (
              <>Sign In <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        <div className="divider" />

        <p className="text-center text-sm text-muted">
          New merchant?{' '}
          <Link to="/signup" style={{ color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>
            Create an account
          </Link>
        </p>

        <div style={{ marginTop: '1.25rem', padding: '0.875rem', background: 'rgba(0,102,255,0.06)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,102,255,0.15)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>Demo Admin Account</p>
          <p className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>admin@aibuyable.com / Admin@123456</p>
        </div>
      </div>
    </div>
  );
}
