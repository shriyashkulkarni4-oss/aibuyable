import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { ordersApi, type AuditLog } from '../api/client';

const DECISION_CONFIG: Record<string, { icon: React.ReactNode; color: string; badge: string }> = {
  allowed: { icon: <CheckCircle size={16} />, color: 'var(--neon-emerald)', badge: 'badge-green' },
  blocked: { icon: <XCircle size={16} />, color: 'var(--danger-red)', badge: 'badge-red' },
  escalated: { icon: <AlertTriangle size={16} />, color: 'var(--warm-amber)', badge: 'badge-amber' },
  info: { icon: <Info size={16} />, color: 'var(--text-accent)', badge: 'badge-blue' },
};

const STEP_LABELS: Record<string, string> = {
  parse_intent: '🧠 Parse Intent',
  catalog_fetch: '🔍 Catalog Fetch',
  pricing_computed: '💰 Pricing',
  discount_check: '% Discount Check',
  guardrail_check: '🛡️ Guardrail Check',
  razorpay_order_created: '💳 Razorpay Order Created',
  escalated_to_hitl: '⏳ Escalated to HITL',
  hitl_approved: '✅ HITL Approved',
  hitl_rejected: '❌ HITL Rejected',
  fallback_triggered: '⚠️ Fallback Triggered',
  payment_captured: '✅ Payment Captured',
  payment_failed: '❌ Payment Failed',
  crawl_completed: '🌐 Crawl Completed',
  guardrail_updated: '🛡️ Guardrail Updated',
};

function AuditEvent({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = DECISION_CONFIG[log.decision] || DECISION_CONFIG.info;

  return (
    <div className={`audit-event ${log.decision}`}>
      <div className="audit-event-card">
        <div className="audit-event-header">
          <span style={{ color: cfg.color, display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
            {cfg.icon}
          </span>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
            {STEP_LABELS[log.step] || log.step}
          </span>
          <span className={`badge ${cfg.badge}`}>{log.decision}</span>
          <span className="badge badge-gray">{log.actor}</span>
          <span className="audit-event-time">
            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {log.reason && (
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.5 }}>
            {log.reason}
          </p>
        )}

        {(log.input_snapshot || log.output_snapshot) && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.5rem 0 0', fontFamily: 'var(--font-mono)' }}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Hide' : 'Show'} I/O Snapshots
            </button>
            {expanded && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                {log.input_snapshot && (
                  <div>
                    <p className="text-xs text-muted" style={{ marginBottom: '0.25rem', fontWeight: 600 }}>INPUT</p>
                    <div className="audit-snapshot">{JSON.stringify(log.input_snapshot, null, 2)}</div>
                  </div>
                )}
                {log.output_snapshot && (
                  <div>
                    <p className="text-xs text-muted" style={{ marginBottom: '0.25rem', fontWeight: 600 }}>OUTPUT</p>
                    <div className="audit-snapshot">{JSON.stringify(log.output_snapshot, null, 2)}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AuditDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    ordersApi.getAudit(orderId).then(setLogs).finally(() => setLoading(false));
  }, [orderId]);

  return (
    <div className="main-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/orders" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Back</Link>
          <div>
            <h2>Audit Trail</h2>
            <p className="font-mono text-sm text-muted">Order: {orderId}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Info size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h3>No audit events found</h3>
          <p className="text-muted text-sm">This order may not exist or has no audit trail yet.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,102,255,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,102,255,0.15)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} color="var(--text-accent)" />
              <span className="text-sm text-muted">{logs.length} events recorded</span>
            </div>
            {['allowed', 'escalated', 'blocked', 'info'].map(dec => {
              const count = logs.filter(l => l.decision === dec).length;
              const cfg = DECISION_CONFIG[dec];
              return count > 0 ? (
                <span key={dec} className={`badge ${cfg.badge}`}>{count} {dec}</span>
              ) : null;
            })}
          </div>

          <div className="audit-timeline">
            {logs.map(log => <AuditEvent key={log.id} log={log} />)}
          </div>
        </>
      )}
    </div>
  );
}
