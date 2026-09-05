import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Package, ShoppingCart, TrendingUp, Bot, Shield, Clock, CheckCircle, MessageSquare, Settings } from 'lucide-react';
import { merchantApi, ordersApi, type Order } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function StatCard({ label, value, color, icon: Icon }: { label: string; value: string | number; color: string; icon: React.ElementType }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className={`stat-card-icon ${color}`}><Icon size={20} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ products: 0, orders: 0, hitlPending: 0, gmv: 0 });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [crawlStatus, orders] = await Promise.all([
          merchantApi.getCrawlStatus(user.merchantId),
          ordersApi.list(),
        ]);
        const hitlOrders = orders.filter(o => o.status === 'hitl_pending');
        const gmv = orders.filter(o => ['paid', 'approved'].includes(o.status)).reduce((s, o) => s + o.total_amount, 0);
        setStats({ products: crawlStatus.products_count, orders: orders.length, hitlPending: hitlOrders.length, gmv });
        setRecentOrders(orders.slice(0, 5));
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [user]);

  const statusColor: Record<string, string> = {
    paid: 'badge-green', approved: 'badge-blue', hitl_pending: 'badge-amber',
    failed: 'badge-red', cancelled: 'badge-red', pending: 'badge-gray',
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'var(--gradient-blue)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart3 size={22} color="#fff" />
          </div>
          <div>
            <h2>Dashboard</h2>
            <p>Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{user?.name}</strong></p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="stats-grid">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : (
        <div className="stats-grid">
          <StatCard label="Products in Catalog" value={stats.products} color="blue" icon={Package} />
          <StatCard label="Total Orders" value={stats.orders} color="green" icon={ShoppingCart} />
          <StatCard label="Awaiting Approval" value={stats.hitlPending} color="amber" icon={Clock} />
          <StatCard label="GMV (INR)" value={`₹${stats.gmv.toLocaleString()}`} color="green" icon={TrendingUp} />
        </div>
      )}

      {/* Quick Action Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { icon: MessageSquare, color: 'var(--electric-blue)', label: 'AI Buyer Chatbot', desc: 'Test the live checkout agent with real orders', href: '/chat', cta: 'Open Chat →' },
          { icon: Shield, color: 'var(--neon-emerald)', label: 'Guardrail Settings', desc: 'Configure discount caps and auto-approve limits', href: '/guardrails', cta: 'Configure →' },
          { icon: Clock, color: 'var(--warm-amber)', label: 'HITL Inbox', desc: `${stats.hitlPending} orders awaiting your approval`, href: '/hitl', cta: 'Review Orders →' },
          { icon: Settings, color: '#8B5CF6', label: 'Reliability Panel', desc: 'Test graceful failure handling end-to-end', href: '/reliability', cta: 'Test Faults →' },
        ].map(({ icon: Icon, color, label, desc, href, cta }) => (
          <Link key={href} to={href} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ cursor: 'pointer' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <Icon size={22} color={color} />
              </div>
              <h4 style={{ marginBottom: '0.25rem' }}>{label}</h4>
              <p className="text-sm text-muted" style={{ marginBottom: '0.75rem' }}>{desc}</p>
              <span style={{ color, fontSize: '0.875rem', fontWeight: 600 }}>{cta}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Orders */}
      {recentOrders.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3>Recent Orders</h3>
            <Link to="/orders" style={{ color: 'var(--text-accent)', textDecoration: 'none', fontSize: '0.875rem' }}>View all →</Link>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Order ID</th><th>Source</th><th>Total</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {recentOrders.map(order => (
                  <tr key={order.id}>
                    <td><Link to={`/orders/${order.id}/audit`} className="font-mono text-xs" style={{ color: 'var(--text-accent)', textDecoration: 'none' }}>{order.id.slice(0, 12)}...</Link></td>
                    <td><span className={`badge ${order.source === 'external_ai_buyer' ? 'badge-amber' : 'badge-blue'}`}>{order.source === 'external_ai_buyer' ? '🤖 External' : '💬 In-Portal'}</span></td>
                    <td><strong style={{ color: 'var(--text-primary)' }}>₹{order.total_amount.toLocaleString()}</strong></td>
                    <td><span className={`badge ${statusColor[order.status] || 'badge-gray'}`}>{order.status}</span></td>
                    <td className="text-muted">{new Date(order.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.orders === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Bot size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>No orders yet</h3>
          <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>Try the AI Buyer Chatbot to place your first order</p>
          <Link to="/chat" className="btn btn-primary">Open AI Chatbot →</Link>
        </div>
      )}
    </div>
  );
}
