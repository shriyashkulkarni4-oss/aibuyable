import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, User, Mail, Lock, Key, Globe, ArrowRight, AlertCircle, ChevronDown } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function SignupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    razorpay_key_id: '',
    razorpay_key_secret: '',
    store_website_url: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRazorpay, setShowRazorpay] = useState(false);

  const updateForm = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const validate = () => {
    if (form.password.length < 8) return 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    if (form.razorpay_key_id && !form.razorpay_key_id.startsWith('rzp_test_') && !form.razorpay_key_id.startsWith('rzp_live_')) {
      return 'Razorpay Key ID must start with rzp_test_ or rzp_live_';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError('');
    setLoading(true);
    try {
      const res = await authApi.signup({
        name: form.name,
        email: form.email,
        password: form.password,
        razorpay_key_id: form.razorpay_key_id || undefined,
        razorpay_key_secret: form.razorpay_key_secret || undefined,
        store_website_url: form.store_website_url || undefined,
      });
      login(res.access_token, res.merchant_id, res.role, res.name);
      navigate('/crawl');
    } catch (err: unknown) {
      setError((err as Error).message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: '2rem' }}>
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ width: 40, height: 40, background: 'var(--gradient-blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={22} color="#fff" />
            </div>
          </div>
          <h1>Create Merchant Account</h1>
          <p>Set up your AIBuyable Gateway in minutes</p>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--danger-red-glow)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <AlertCircle size={16} color="var(--danger-red)" />
            <span style={{ color: 'var(--danger-red)', fontSize: '0.875rem' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input id="signup-name" type="text" className="form-input" style={{ paddingLeft: '2.5rem' }} placeholder="Jane Doe" value={form.name} onChange={e => updateForm('name', e.target.value)} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input id="signup-email" type="email" className="form-input" style={{ paddingLeft: '2.5rem' }} placeholder="you@store.com" value={form.email} onChange={e => updateForm('email', e.target.value)} required />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input id="signup-password" type="password" className="form-input" style={{ paddingLeft: '2.5rem' }} placeholder="Min. 8 chars" value={form.password} onChange={e => updateForm('password', e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input id="signup-confirm-password" type="password" className="form-input" placeholder="Repeat password" value={form.confirmPassword} onChange={e => updateForm('confirmPassword', e.target.value)} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Store Website URL</label>
            <div style={{ position: 'relative' }}>
              <Globe size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input id="signup-store-url" type="url" className="form-input" style={{ paddingLeft: '2.5rem' }} placeholder="https://mystore.com" value={form.store_website_url} onChange={e => updateForm('store_website_url', e.target.value)} />
            </div>
          </div>

          {/* Razorpay Section — Collapsible */}
          <div style={{ marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setShowRazorpay(!showRazorpay)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-accent)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, padding: 0 }}
            >
              <Key size={14} />
              Razorpay Integration (optional)
              <ChevronDown size={14} style={{ transform: showRazorpay ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {showRazorpay && (
              <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(0,102,255,0.05)', border: '1px solid rgba(0,102,255,0.15)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Enter your Razorpay <strong style={{ color: 'var(--text-secondary)' }}>Test Mode</strong> keys. The secret is encrypted at rest and never returned after saving.
                </p>
                <div className="form-group">
                  <label className="form-label">Razorpay Key ID</label>
                  <input id="signup-rzp-key-id" type="text" className="form-input mono" placeholder="rzp_test_xxxxxxxxxxxx" value={form.razorpay_key_id} onChange={e => updateForm('razorpay_key_id', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Razorpay Key Secret</label>
                  <input id="signup-rzp-key-secret" type="password" className="form-input mono" placeholder="Your Razorpay secret" value={form.razorpay_key_secret} onChange={e => updateForm('razorpay_key_secret', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <button
            id="signup-submit"
            type="submit"
            className="btn btn-primary w-full btn-lg"
            style={{ justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? (
              <><span className="crawl-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating account...</>
            ) : (
              <>Create Account & Start Setup <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        <div className="divider" />

        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
