import React, { useState, useEffect, useRef } from 'react';
import {
  User, Mail, Globe, Key, Lock, Shield, Save, CheckCircle,
  Eye, EyeOff, AlertTriangle, Edit2, Camera, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { merchantApi, type MerchantProfile } from '../api/client';

// ─── Section Card ─────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginBottom: '1.25rem', padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}>
          <Icon size={16} color="var(--text-accent)" />
        </div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem', margin: '0.3rem 0 0' }}>{hint}</p>}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.875rem',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
  outline: 'none',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box',
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, updateUserName } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // which section is saving

  // Form state per section
  const [info, setInfo] = useState({ name: '', email: '' });
  const [store, setStore] = useState({ store_website_url: '' });
  const [razorpay, setRazorpay] = useState({ razorpay_key_id: '', razorpay_key_secret: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    merchantApi.getProfile().then(p => {
      setProfile(p);
      setInfo({ name: p.name, email: p.email });
      setStore({ store_website_url: p.store_website_url || '' });
      setRazorpay({ razorpay_key_id: p.razorpay_key_id || '', razorpay_key_secret: '' });
      setLoading(false);
    }).catch(() => {
      toast.error('Failed to load profile');
      setLoading(false);
    });
  }, []);

  async function save(section: string, payload: Record<string, string | undefined>) {
    setSaving(section);
    try {
      const updated = await merchantApi.updateProfile(payload);
      setProfile(updated);
      // Sync name in auth context
      if (payload.name && updateUserName) updateUserName(payload.name);
      toast.success('Saved successfully!');
      // Clear password fields on success
      if (section === 'password') setPassword({ current_password: '', new_password: '', confirm: '' });
      if (section === 'razorpay') setRazorpay(r => ({ ...r, razorpay_key_secret: '' }));
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  function SaveButton({ section, disabled }: { section: string; disabled?: boolean }) {
    const isSaving = saving === section;
    return (
      <button
        className="btn btn-primary btn-sm"
        disabled={isSaving || disabled}
        onClick={() => {
          if (section === 'info') save('info', { name: info.name || undefined, email: info.email || undefined });
          if (section === 'store') save('store', { store_website_url: store.store_website_url || undefined });
          if (section === 'razorpay') save('razorpay', {
            razorpay_key_id: razorpay.razorpay_key_id || undefined,
            razorpay_key_secret: razorpay.razorpay_key_secret || undefined,
          });
          if (section === 'password') {
            if (password.new_password !== password.confirm) {
              toast.error('New passwords do not match'); return;
            }
            save('password', {
              current_password: password.current_password,
              new_password: password.new_password,
            });
          }
        }}
        style={{ minWidth: 100 }}
      >
        {isSaving
          ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Saving…</>
          : <><Save size={13} /> Save</>
        }
      </button>
    );
  }

  if (loading) {
    return (
      <div className="main-content">
        <div className="page-header"><h2>My Profile</h2></div>
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 180, marginBottom: '1.25rem' }} />)}
      </div>
    );
  }

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <div className="main-content">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'var(--gradient-blue)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={22} color="#fff" />
          </div>
          <div>
            <h2>My Profile</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Manage your account details, store, and payment settings</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left — Avatar card */}
        <div>
          <div className="card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1.25rem' }}>
            {/* Avatar */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: '1.25rem' }}>
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'var(--gradient-blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
                boxShadow: '0 0 0 4px rgba(59,130,246,0.15)',
              }}>
                <span style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
                  {profile?.name?.[0]?.toUpperCase() || 'M'}
                </span>
              </div>
            </div>

            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              {profile?.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {profile?.email}
            </div>

            <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>Merchant</span>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Member since</span>
                <span style={{ color: 'var(--text-secondary)' }}>{joinDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Crawl status</span>
                <span className={`badge ${profile?.crawl_status === 'completed' ? 'badge-green' : profile?.crawl_status === 'crawling' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: '0.68rem' }}>
                  {profile?.crawl_status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Razorpay</span>
                <span className={`badge ${profile?.has_razorpay_secret ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                  {profile?.has_razorpay_secret ? '✓ Connected' : 'Not set'}
                </span>
              </div>
            </div>
          </div>

          {/* Merchant ID */}
          <div className="card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Merchant ID</div>
            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.5 }}>
              {profile?.id}
            </div>
          </div>
        </div>

        {/* Right — Form sections */}
        <div>

          {/* Personal Info */}
          <Section title="Personal Information" icon={User}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="Full Name">
                <input
                  id="profile-name"
                  type="text"
                  style={INPUT_STYLE}
                  value={info.name}
                  onChange={e => setInfo(s => ({ ...s, name: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; }}
                />
              </Field>
              <Field label="Email Address">
                <input
                  id="profile-email"
                  type="email"
                  style={INPUT_STYLE}
                  value={info.email}
                  onChange={e => setInfo(s => ({ ...s, email: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; }}
                />
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveButton section="info" disabled={!info.name && !info.email} />
            </div>
          </Section>

          {/* Store */}
          <Section title="Store Settings" icon={Globe}>
            <Field label="Store Website URL" hint="This URL is used for catalog crawling. Change it and re-crawl to refresh your product catalog.">
              <input
                id="profile-store-url"
                type="url"
                placeholder="https://yourstore.com"
                style={INPUT_STYLE}
                value={store.store_website_url}
                onChange={e => setStore({ store_website_url: e.target.value })}
                onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; }}
              />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveButton section="store" />
            </div>
          </Section>

          {/* Razorpay */}
          <Section title="Razorpay Integration" icon={Zap}>
            <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--electric-blue)' }}>Test Mode</strong> — Your keys are used only in Razorpay test mode. Real charges never occur. The secret is stored encrypted (AES-256).
            </div>

            <Field label="Razorpay Key ID">
              <input
                id="profile-rzp-key-id"
                type="text"
                placeholder="rzp_test_XXXXXXXXXX"
                style={INPUT_STYLE}
                value={razorpay.razorpay_key_id}
                onChange={e => setRazorpay(s => ({ ...s, razorpay_key_id: e.target.value }))}
                onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; }}
              />
            </Field>

            <Field label="Razorpay Key Secret" hint={profile?.has_razorpay_secret ? '✓ Secret already saved. Enter a new value only if you want to replace it.' : 'Enter your Razorpay API secret key. It will be encrypted before storage.'}>
              <div style={{ position: 'relative' }}>
                <input
                  id="profile-rzp-key-secret"
                  type={showSecret ? 'text' : 'password'}
                  placeholder={profile?.has_razorpay_secret ? '••••••••••••••••• (leave blank to keep existing)' : 'Enter key secret…'}
                  style={{ ...INPUT_STYLE, paddingRight: '2.5rem' }}
                  value={razorpay.razorpay_key_secret}
                  onChange={e => setRazorpay(s => ({ ...s, razorpay_key_secret: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveButton section="razorpay" />
            </div>
          </Section>

          {/* Change Password */}
          <Section title="Change Password" icon={Lock}>
            <Field label="Current Password">
              <div style={{ position: 'relative' }}>
                <input
                  id="profile-current-password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter current password"
                  style={{ ...INPUT_STYLE, paddingRight: '2.5rem' }}
                  value={password.current_password}
                  onChange={e => setPassword(s => ({ ...s, current_password: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; }}
                />
                <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="New Password">
                <input
                  id="profile-new-password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  style={{
                    ...INPUT_STYLE,
                    borderColor: password.new_password && password.confirm && password.new_password !== password.confirm
                      ? 'var(--danger-red)' : 'var(--border-subtle)'
                  }}
                  value={password.new_password}
                  onChange={e => setPassword(s => ({ ...s, new_password: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                  onBlur={e => {
                    e.target.style.borderColor = password.new_password && password.confirm && password.new_password !== password.confirm
                      ? 'var(--danger-red)' : 'var(--border-subtle)';
                  }}
                />
              </Field>
              <Field label="Confirm New Password">
                <input
                  id="profile-confirm-password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  style={{
                    ...INPUT_STYLE,
                    borderColor: password.new_password && password.confirm && password.new_password !== password.confirm
                      ? 'var(--danger-red)' : 'var(--border-subtle)'
                  }}
                  value={password.confirm}
                  onChange={e => setPassword(s => ({ ...s, confirm: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; }}
                  onBlur={e => {
                    e.target.style.borderColor = password.new_password && password.confirm && password.new_password !== password.confirm
                      ? 'var(--danger-red)' : 'var(--border-subtle)';
                  }}
                />
              </Field>
            </div>

            {password.new_password && password.confirm && password.new_password !== password.confirm && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--danger-red)' }}>
                <AlertTriangle size={13} /> Passwords do not match
              </div>
            )}
            {password.new_password && password.confirm && password.new_password === password.confirm && password.new_password.length >= 8 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--neon-emerald)' }}>
                <CheckCircle size={13} /> Passwords match
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveButton
                section="password"
                disabled={!password.current_password || !password.new_password || password.new_password !== password.confirm || password.new_password.length < 8}
              />
            </div>
          </Section>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
