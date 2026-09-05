import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, BarChart3, TrendingUp, ShoppingCart, CheckCircle, Clock, XCircle } from 'lucide-react';
import { adminApi } from '../api/client';

interface PlatformStats {
  total_merchants: number;
  total_gmv: number;
  total_orders: number;
  total_auto_approved: number;
  total_hitl_escalated: number;
  total_failed: number;
}

interface MerchantSummary {
  id: string;
  name: string;
  email: string;
  store_website_url?: string;
  crawl_status: string;
  product_count: number;
  order_count: number;
  gmv: number;
  auto_approved: number;
  hitl_escalated: number;
  failed: number;
  created_at: string;
}

export default function AdminDashboard() {
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getMerchants().then((data: { merchants: unknown[]; platform_stats: Record<string, number> }) => {
      setMerchants(data.merchants as MerchantSummary[]);
      setStats(data.platform_stats as PlatformStats);
    }).finally(() => setLoading(false));
  }, []);

  const crawlBadge: Record<string, string> = {
    completed: 'badge-green', crawling: 'badge-blue', failed: 'badge-red', not_started: 'badge-gray',
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'var(--gradient-blue)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart3 size={22} color="#fff" />
          </div>
          <div>
            <h2>Admin Dashboard</h2>
            <p>Platform-wide metrics and merchant oversight</p>
          </div>
        </div>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'Total Merchants', value: stats.total_merchants, color: 'blue', icon: Users },
            { label: 'Platform GMV', value: `₹${stats.total_gmv.toLocaleString()}`, color: 'green', icon: TrendingUp },
            { label: 'Total Orders', value: stats.total_orders, color: 'blue', icon: ShoppingCart },
            { label: 'Auto-Approved', value: stats.total_auto_approved, color: 'green', icon: CheckCircle },
            { label: 'HITL Escalated', value: stats.total_hitl_escalated, color: 'amber', icon: Clock },
            { label: 'Failed/Cancelled', value: stats.total_failed, color: 'red', icon: XCircle },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className={`stat-card ${color}`}>
              <div className={`stat-card-icon ${color}`}><Icon size={20} /></div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Merchants Table */}
      <h3 style={{ marginBottom: '1rem' }}>Merchant Accounts</h3>
      {loading ? (
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Store URL</th>
                <th>Crawl</th>
                <th>Products</th>
                <th>Orders</th>
                <th>GMV</th>
                <th>Auto / HITL / Failed</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map(m => (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{m.name}</div>
                    <div className="text-xs text-muted">{m.email}</div>
                  </td>
                  <td>
                    {m.store_website_url ? (
                      <a href={m.store_website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-accent)', fontSize: '0.8rem', textDecoration: 'none' }}>
                        {new URL(m.store_website_url).hostname}
                      </a>
                    ) : '—'}
                  </td>
                  <td><span className={`badge ${crawlBadge[m.crawl_status] || 'badge-gray'}`}>{m.crawl_status}</span></td>
                  <td>{m.product_count}</td>
                  <td>{m.order_count}</td>
                  <td><strong style={{ color: 'var(--neon-emerald)' }}>₹{m.gmv.toLocaleString()}</strong></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <span className="badge badge-green">{m.auto_approved}</span>
                      <span className="badge badge-amber">{m.hitl_escalated}</span>
                      <span className="badge badge-red">{m.failed}</span>
                    </div>
                  </td>
                  <td>
                    <Link to={`/admin/merchants/${m.id}`} id={`admin-merchant-${m.id}`} className="btn btn-ghost btn-sm">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {merchants.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No merchants registered yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
