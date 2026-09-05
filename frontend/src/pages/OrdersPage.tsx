import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, CheckCircle, Clock, XCircle, Filter, ExternalLink } from 'lucide-react';
import { ordersApi, type Order } from '../api/client';

const STATUS_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  paid: { label: 'Paid', color: 'var(--neon-emerald)', badge: 'badge-green' },
  approved: { label: 'Approved', color: 'var(--electric-blue)', badge: 'badge-blue' },
  hitl_pending: { label: 'Awaiting Approval', color: 'var(--warm-amber)', badge: 'badge-amber' },
  pending: { label: 'Pending', color: 'var(--text-muted)', badge: 'badge-gray' },
  failed: { label: 'Failed', color: 'var(--danger-red)', badge: 'badge-red' },
  cancelled: { label: 'Cancelled', color: 'var(--danger-red)', badge: 'badge-red' },
  expired: { label: 'Expired', color: 'var(--text-muted)', badge: 'badge-gray' },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersApi.list(statusFilter || undefined).then(setOrders).finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="main-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'var(--gradient-blue)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCart size={22} color="#fff" />
          </div>
          <div>
            <h2>Orders</h2>
            <p>All orders from in-portal agent and external AI buyers</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={16} color="var(--text-muted)" />
        {['', 'paid', 'approved', 'hitl_pending', 'pending', 'failed', 'cancelled'].map(s => (
          <button
            key={s}
            id={`filter-${s || 'all'}`}
            className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatusFilter(s)}
          >
            {s ? STATUS_CONFIG[s]?.label || s : 'All Orders'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <ShoppingCart size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h3>No orders {statusFilter ? `with status "${statusFilter}"` : 'yet'}</h3>
          <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>Try the AI chatbot to place your first order</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Source</th>
                <th>Items</th>
                <th>Total</th>
                <th>Discount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Audit</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const cfg = STATUS_CONFIG[order.status] || { label: order.status, badge: 'badge-gray' };
                return (
                  <tr key={order.id}>
                    <td>
                      <div>
                        <span className="font-mono text-xs text-accent">{order.id.slice(0, 12)}...</span>
                        {order.buyer_reference && (
                          <div className="font-mono text-xs text-muted" style={{ marginTop: 2 }}>
                            {order.buyer_reference.slice(0, 20)}...
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${order.source === 'external_ai_buyer' ? 'badge-amber' : 'badge-blue'}`}>
                        {order.source === 'external_ai_buyer' ? '🤖 External' : '💬 In-Portal'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {order.items.slice(0, 2).map((item, i) => (
                          <div key={i}>{item.name || 'Item'} × {item.qty}</div>
                        ))}
                        {order.items.length > 2 && <div className="text-muted">+{order.items.length - 2} more</div>}
                      </div>
                    </td>
                    <td><strong style={{ color: 'var(--text-primary)' }}>₹{order.total_amount.toLocaleString()}</strong></td>
                    <td>
                      {order.discount_amount > 0 ? (
                        <span className="badge badge-green">-₹{order.discount_amount.toLocaleString()}</span>
                      ) : '—'}
                    </td>
                    <td><span className={`badge ${cfg.badge}`}>{cfg.label}</span></td>
                    <td className="text-muted text-xs">
                      {new Date(order.created_at).toLocaleDateString()}<br/>
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <Link
                        to={`/orders/${order.id}/audit`}
                        id={`audit-link-${order.id}`}
                        className="btn btn-ghost btn-sm"
                        style={{ gap: '0.35rem', fontSize: '0.75rem' }}
                      >
                        Audit Trail <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
