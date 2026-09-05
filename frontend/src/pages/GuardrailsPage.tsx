import React, { useState, useEffect } from 'react';
import { Save, Shield, DollarSign, Percent, Calendar, CreditCard, Info } from 'lucide-react';
import { merchantApi, type Guardrail } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI', emoji: '📱' },
  { value: 'card', label: 'Card', emoji: '💳' },
  { value: 'netbanking', label: 'Net Banking', emoji: '🏦' },
  { value: 'wallet', label: 'Wallet', emoji: '👛' },
];

export default function GuardrailsPage() {
  const { user } = useAuth();
  const [guardrail, setGuardrail] = useState<Guardrail | null>(null);
  const [form, setForm] = useState({
    max_discount_percent: 15,
    max_auto_approve_amount: 5000,
    require_hitl_above_amount: 10000,
    daily_agent_spend_cap: '',
    allowed_payment_methods: ['upi', 'card', 'netbanking', 'wallet'],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    merchantApi.getGuardrails(user.merchantId).then(g => {
      setGuardrail(g);
      setForm({
        max_discount_percent: g.max_discount_percent,
        max_auto_approve_amount: g.max_auto_approve_amount,
        require_hitl_above_amount: g.require_hitl_above_amount,
        daily_agent_spend_cap: g.daily_agent_spend_cap?.toString() || '',
        allowed_payment_methods: g.allowed_payment_methods,
      });
    }).catch(() => {});
  }, [user]);

  const toggleMethod = (method: string) => {
    setForm(prev => ({
      ...prev,
      allowed_payment_methods: prev.allowed_payment_methods.includes(method)
        ? prev.allowed_payment_methods.filter(m => m !== method)
        : [...prev.allowed_payment_methods, method],
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await merchantApi.updateGuardrails(user.merchantId, {
        max_discount_percent: form.max_discount_percent,
        max_auto_approve_amount: form.max_auto_approve_amount,
        require_hitl_above_amount: form.require_hitl_above_amount,
        daily_agent_spend_cap: form.daily_agent_spend_cap ? parseFloat(form.daily_agent_spend_cap) : undefined,
        allowed_payment_methods: form.allowed_payment_methods,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #10B981, #059669)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={22} color="#fff" />
          </div>
          <div>
            <h2>Guardrail Settings</h2>
            <p>Control what the AI agent can approve autonomously vs. what needs your review</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Discount Cap */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <Percent size={20} color="var(--electric-blue)" />
              <div>
                <h4>Maximum Allowed Discount</h4>
                <p className="text-xs text-muted">The AI agent will NEVER grant more than this, enforced in code</p>
              </div>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--electric-blue)' }}>{form.max_discount_percent}%</span>
            </div>
            <input
              id="max-discount-slider"
              type="range"
              min={0} max={50} step={1}
              value={form.max_discount_percent}
              onChange={e => setForm(prev => ({ ...prev, max_discount_percent: Number(e.target.value) }))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
              <span className="text-xs text-muted">0% (no discounts)</span>
              <span className="text-xs text-muted">50%</span>
            </div>
          </div>

          {/* Auto-Approve Amount */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <DollarSign size={20} color="var(--neon-emerald)" />
              <div>
                <h4>Auto-Approve Ceiling</h4>
                <p className="text-xs text-muted">Orders at or below this amount auto-approve (if discount also within cap)</p>
              </div>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--neon-emerald)' }}>₹{form.max_auto_approve_amount.toLocaleString()}</span>
            </div>
            <input
              id="auto-approve-slider"
              type="range"
              min={500} max={50000} step={500}
              value={form.max_auto_approve_amount}
              onChange={e => setForm(prev => ({ ...prev, max_auto_approve_amount: Number(e.target.value) }))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
              <span className="text-xs text-muted">₹500</span>
              <span className="text-xs text-muted">₹50,000</span>
            </div>
          </div>

          {/* Mandatory HITL Threshold */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <Shield size={20} color="var(--warm-amber)" />
              <div>
                <h4>Mandatory HITL Threshold</h4>
                <p className="text-xs text-muted">Forces human review regardless of other conditions once total exceeds this</p>
              </div>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--warm-amber)' }}>₹{form.require_hitl_above_amount.toLocaleString()}</span>
            </div>
            <input
              id="hitl-threshold-slider"
              type="range"
              min={1000} max={100000} step={1000}
              value={form.require_hitl_above_amount}
              onChange={e => setForm(prev => ({ ...prev, require_hitl_above_amount: Number(e.target.value) }))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
              <span className="text-xs text-muted">₹1,000</span>
              <span className="text-xs text-muted">₹1,00,000</span>
            </div>
          </div>

          {/* Daily Spend Cap */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Calendar size={20} color="#8B5CF6" />
              <div>
                <h4>Daily Agent Spend Cap (Optional)</h4>
                <p className="text-xs text-muted">Total INR the agent can auto-approve in a single day before forcing HITL</p>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '1rem' }}>₹</span>
              <input
                id="daily-cap-input"
                type="number"
                className="form-input"
                style={{ paddingLeft: '2rem' }}
                placeholder="Leave empty for no daily cap"
                value={form.daily_agent_spend_cap}
                onChange={e => setForm(prev => ({ ...prev, daily_agent_spend_cap: e.target.value }))}
                min={0}
              />
            </div>
          </div>

          {/* Payment Methods */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <CreditCard size={20} color="var(--text-accent)" />
              <div>
                <h4>Allowed Payment Methods</h4>
                <p className="text-xs text-muted">Methods available for agent-originated orders</p>
              </div>
            </div>
            <div className="checkbox-group">
              {PAYMENT_METHODS.map(({ value, label, emoji }) => (
                <label
                  key={value}
                  className={`checkbox-pill ${form.allowed_payment_methods.includes(value) ? 'checked' : ''}`}
                  id={`payment-method-${value}`}
                >
                  <input
                    type="checkbox"
                    checked={form.allowed_payment_methods.includes(value)}
                    onChange={() => toggleMethod(value)}
                  />
                  {emoji} {label}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            id="save-guardrails-btn"
            className={`btn btn-lg ${saved ? 'btn-success' : 'btn-primary'}`}
            style={{ alignSelf: 'flex-start', justifyContent: 'center' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : saved ? <><Save size={18} /> Saved!</> : <><Save size={18} /> Save Guardrails</>}
          </button>
        </div>

        {/* Decision Logic Preview */}
        <div style={{ position: 'sticky', top: '2rem' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Info size={16} color="var(--text-accent)" />
              <h4>Decision Logic Preview</h4>
            </div>
            <p className="text-xs text-muted" style={{ marginBottom: '1rem' }}>Evaluated top-to-bottom. First match wins.</p>
            {[
              { condition: `Total > ₹${form.require_hitl_above_amount.toLocaleString()}`, result: 'HITL Required', color: 'var(--warm-amber)' },
              { condition: `Discount request > ${form.max_discount_percent}%`, result: 'HITL Required', color: 'var(--warm-amber)' },
              { condition: `Total > ₹${form.max_auto_approve_amount.toLocaleString()}`, result: 'HITL Required', color: 'var(--warm-amber)' },
              { condition: form.daily_agent_spend_cap ? `Daily spent + total > ₹${parseFloat(form.daily_agent_spend_cap).toLocaleString()}` : 'No daily cap set', result: form.daily_agent_spend_cap ? 'HITL Required' : '—', color: form.daily_agent_spend_cap ? 'var(--warm-amber)' : 'var(--text-muted)' },
              { condition: 'All conditions pass', result: 'Auto-Approve ✓', color: 'var(--neon-emerald)' },
            ].map((rule, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: i < 4 ? '1px solid var(--border-subtle)' : 'none' }}>
                <span className="text-xs text-muted">{rule.condition}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: rule.color, whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>{rule.result}</span>
              </div>
            ))}
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,102,255,0.06)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,102,255,0.12)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                💡 <strong style={{ color: 'var(--text-secondary)' }}>Discount cap is code-enforced</strong> — the AI agent cannot grant more than {form.max_discount_percent}% regardless of what a buyer requests.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
