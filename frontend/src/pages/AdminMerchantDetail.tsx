import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Shield, Package, ShoppingCart, Clock } from 'lucide-react';
import { adminApi } from '../api/client';

export default function AdminMerchantDetail() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!merchantId) return;
    adminApi.getMerchantDetail(merchantId).then(d => setData(d as Record<string, unknown>)).finally(() => setLoading(false));
  }, [merchantId]);

  if (loading) return <div className="main-content"><div className="skeleton" style={{ height: 400, borderRadius: 12 }} /></div>;
  if (!data) return <div className="main-content"><p className="text-muted">Merchant not found</p></div>;

  const merchant = data.merchant as Record<string, unknown>;
  const guardrails = data.guardrails as Record<string, unknown> | null;
  const products = data.products as unknown[];
  const orders = data.orders as unknown[];
  const auditLogs = data.audit_logs as unknown[];

  return (
    <div className="main-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/admin" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Back</Link>
          <div>
            <h2>{merchant.name as string}</h2>
            <p className="text-muted">{merchant.email as string}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Guardrails (read-only) */}
        {guardrails && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Shield size={18} color="var(--neon-emerald)" />
              <h4>Guardrail Configuration</h4>
            </div>
            {[
              { label: 'Max Discount', value: `${guardrails.max_discount_percent}%` },
              { label: 'Auto-Approve Ceiling', value: `₹${(guardrails.max_auto_approve_amount as number).toLocaleString()}` },
              { label: 'Mandatory HITL Above', value: `₹${(guardrails.require_hitl_above_amount as number).toLocaleString()}` },
              { label: 'Daily Cap', value: guardrails.daily_agent_spend_cap ? `₹${(guardrails.daily_agent_spend_cap as number).toLocaleString()}` : 'None' },
              { label: 'Payment Methods', value: (guardrails.allowed_payment_methods as string[]).join(', ') },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.875rem' }}>
                <span className="text-muted">{label}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
            <p className="text-xs text-muted" style={{ marginTop: '0.75rem' }}>Admin view is read-only — only the merchant can change these settings.</p>
          </div>
        )}

        {/* Products */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Package size={18} color="var(--electric-blue)" />
            <h4>Products ({(products as unknown[]).length})</h4>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {(products as { id: string; name: string; price: number; stock_qty: number; is_active: boolean }[]).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.875rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: 'var(--neon-emerald)', fontWeight: 500 }}>₹{p.price.toLocaleString()}</span>
                  <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '0.65rem' }}>{p.is_active ? 'Active' : 'Off'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <ShoppingCart size={18} color="var(--warm-amber)" />
            <h4>Recent Orders ({(orders as unknown[]).length})</h4>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID</th><th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Source</th><th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total</th><th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</th></tr></thead>
            <tbody>
              {(orders as { id: string; source: string; total_amount: number; status: string }[]).map(o => (
                <tr key={o.id}>
                  <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-accent)' }}>{o.id.slice(0, 12)}...</td>
                  <td style={{ padding: '0.5rem' }}><span className={`badge ${o.source === 'external_ai_buyer' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>{o.source === 'external_ai_buyer' ? '🤖' : '💬'} {o.source}</span></td>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>₹{o.total_amount.toLocaleString()}</td>
                  <td style={{ padding: '0.5rem' }}><span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Audit Log */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Clock size={18} color="var(--text-accent)" />
            <h4>Recent Audit Events ({(auditLogs as unknown[]).length})</h4>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {(auditLogs as { id: string; step: string; decision: string; reason: string; actor: string; created_at: string }[]).map(log => (
              <div key={log.id} style={{ padding: '0.625rem 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '1rem', alignItems: 'flex-start', fontSize: '0.8rem' }}>
                <span className={`badge ${log.decision === 'allowed' ? 'badge-green' : log.decision === 'blocked' ? 'badge-red' : log.decision === 'escalated' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: '0.7rem', flexShrink: 0 }}>{log.decision}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{log.step}</span>
                  {log.reason && <p style={{ color: 'var(--text-muted)', marginTop: '0.1rem', lineHeight: 1.4 }}>{log.reason}</p>}
                </div>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
