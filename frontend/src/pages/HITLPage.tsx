import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, ShoppingCart, Shield, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { ordersApi, type Order } from '../api/client';

function HITLOrderCard({ order, onAction }: { order: Order; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Get escalation reason from order failure_reason or a placeholder
  const escalationReason = order.failure_reason || 'This order exceeded the auto-approve threshold';

  const approve = async () => {
    setLoading('approve');
    try {
      await ordersApi.hitlApprove(order.id);
      onAction();
    } catch (err: unknown) {
      alert((err as Error).message || 'Approval failed');
    } finally {
      setLoading(null);
    }
  };

  const reject = async () => {
    setLoading('reject');
    try {
      await ordersApi.hitlReject(order.id, rejectReason || undefined);
      onAction();
    } catch (err: unknown) {
      alert((err as Error).message || 'Rejection failed');
    } finally {
      setLoading(null);
      setShowRejectInput(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--warm-amber)' }}>
      {/* Order Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-amber"><Clock size={12} /> Awaiting Approval</span>
            <span className={`badge ${order.source === 'external_ai_buyer' ? 'badge-amber' : 'badge-blue'}`}>
              {order.source === 'external_ai_buyer' ? '🤖 External AI' : '💬 In-Portal'}
            </span>
          </div>
          <p className="font-mono text-xs text-muted">{order.id}</p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ₹{order.total_amount.toLocaleString()}
          </div>
          {order.discount_amount > 0 && (
            <div className="text-xs text-muted">
              incl. ₹{order.discount_amount.toLocaleString()} discount ({order.requested_discount_percent}%)
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            id={`expand-order-${order.id}`}
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Details
          </button>
        </div>
      </div>

      {/* Escalation Reason — Always Visible */}
      <div style={{ marginTop: '0.875rem', padding: '0.75rem', background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <Shield size={14} color="var(--warm-amber)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-xs" style={{ color: 'var(--warm-amber)', fontWeight: 600, marginBottom: '0.2rem' }}>Why escalated</p>
            <p className="text-sm text-muted">{escalationReason}</p>
          </div>
        </div>
      </div>

      {/* Expanded Items */}
      {expanded && order.items.length > 0 && (
        <div style={{ marginTop: '0.875rem', padding: '0.875rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
          <p className="text-xs text-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>ORDER ITEMS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {order.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{item.name || 'Product'} × {item.qty}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>₹{item.line_total.toLocaleString()}</span>
              </div>
            ))}
            <div className="divider" style={{ margin: '0.25rem 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
              <span>Total</span>
              <span style={{ color: 'var(--text-primary)' }}>₹{order.total_amount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <button
          id={`approve-btn-${order.id}`}
          className="btn btn-success"
          onClick={approve}
          disabled={!!loading}
        >
          <CheckCircle size={16} />
          {loading === 'approve' ? 'Approving...' : 'Approve & Create Payment Link'}
        </button>

        {!showRejectInput ? (
          <button
            id={`reject-btn-${order.id}`}
            className="btn btn-danger"
            onClick={() => setShowRejectInput(true)}
            disabled={!!loading}
          >
            <XCircle size={16} />
            Reject
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-danger" onClick={reject} disabled={!!loading}>
              {loading === 'reject' ? '...' : 'Confirm Reject'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRejectInput(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HITLPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = () => {
    setLoading(true);
    ordersApi.getHitlPending().then(setOrders).finally(() => setLoading(false));
  };

  useEffect(() => { loadOrders(); }, []);

  return (
    <div className="main-content">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'var(--gradient-amber)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={22} color="#000" />
          </div>
          <div>
            <h2>HITL Approval Inbox</h2>
            <p>Orders that exceeded guardrail thresholds and require your review</p>
          </div>
        </div>
        <button id="refresh-hitl-btn" className="btn btn-ghost btn-sm" onClick={loadOrders}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12 }} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>
          <CheckCircle size={56} color="var(--neon-emerald)" style={{ marginBottom: '1rem' }} />
          <h3>Inbox Clear!</h3>
          <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>No orders awaiting approval right now.</p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-amber" style={{ fontSize: '0.875rem', padding: '0.375rem 0.875rem' }}>
              <ShoppingCart size={14} /> {orders.length} pending
            </span>
            <p className="text-muted text-sm">Newest first — each shows exactly why it was escalated</p>
          </div>
          {orders.map(order => (
            <HITLOrderCard key={order.id} order={order} onAction={loadOrders} />
          ))}
        </div>
      )}
    </div>
  );
}
