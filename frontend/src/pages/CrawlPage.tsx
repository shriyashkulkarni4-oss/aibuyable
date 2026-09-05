import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, CheckCircle, XCircle, RefreshCw, Package, AlertTriangle } from 'lucide-react';
import { merchantApi, type Product } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function CrawlPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [crawlStatus, setCrawlStatus] = useState<string>('not_started');
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      const status = await merchantApi.getCrawlStatus(user.merchantId);
      setCrawlStatus(status.crawl_status);
      setCrawlError(status.crawl_error || null);
      setProductCount(status.products_count);
      if (status.crawl_status === 'completed') {
        const prods = await merchantApi.getProducts(user.merchantId);
        setProducts(prods);
      }
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (crawlStatus === 'crawling') {
      const interval = setInterval(fetchStatus, 2000);
      setPolling(true);
      return () => { clearInterval(interval); setPolling(false); };
    } else {
      setPolling(false);
    }
  }, [crawlStatus, fetchStatus]);

  const startCrawl = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await merchantApi.startCrawl(user.merchantId);
      setCrawlStatus('crawling');
      await fetchStatus();
    } catch (err: unknown) {
      setCrawlError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: '3rem' }}>
      <div style={{ width: '100%', maxWidth: 700, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 64, height: 64, background: 'var(--gradient-blue)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Globe size={32} color="#fff" />
          </div>
          <h2>Catalog Ingestion</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            We'll crawl your store and automatically import your product catalog
          </p>
        </div>

        {/* Status Card */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          {(crawlStatus === 'not_started' || crawlStatus === 'idle') && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Globe size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
              <h3 style={{ marginBottom: '0.5rem' }}>Ready to crawl your store</h3>
              <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
                We'll extract products, prices, and images from your website automatically.
              </p>
              <button id="start-crawl-btn" className="btn btn-primary btn-lg" onClick={startCrawl} disabled={loading}>
                {loading ? 'Starting...' : '🚀 Start Crawling'}
              </button>
            </div>
          )}

          {crawlStatus === 'crawling' && (
            <div className="crawl-progress">
              <div className="crawl-spinner" />
              <div>
                <h3>Crawling your store...</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  Discovering products, extracting prices, and importing catalog.
                  {polling && ' Updating every 2s...'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {['Fetching pages', 'Parsing JSON-LD', 'Extracting products', 'Saving to catalog'].map((step, i) => (
                  <div key={step} className="step-badge">
                    <span className="pulse-dot" style={{ animationDelay: `${i * 0.3}s` }} />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {crawlStatus === 'completed' && (
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <CheckCircle size={48} color="var(--neon-emerald)" style={{ marginBottom: '1rem' }} />
              <h3 style={{ color: 'var(--neon-emerald)' }}>Crawl Complete!</h3>
              <p className="text-muted text-sm" style={{ margin: '0.5rem 0 1.5rem' }}>
                Found <strong style={{ color: 'var(--text-primary)' }}>{productCount} products</strong>. Review and edit below.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button id="recrawl-btn" className="btn btn-ghost" onClick={startCrawl}>
                  <RefreshCw size={16} /> Re-crawl
                </button>
                <button id="go-to-guardrails" className="btn btn-success" onClick={() => navigate('/guardrails')}>
                  Configure Guardrails →
                </button>
              </div>
              {productCount > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--warm-amber)' }}>
                    <AlertTriangle size={14} />
                    Products with estimated stock (default 100) are marked — please review and update quantities.
                  </div>
                </div>
              )}
            </div>
          )}

          {crawlStatus === 'failed' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <XCircle size={48} color="var(--danger-red)" style={{ marginBottom: '1rem' }} />
              <h3 style={{ color: 'var(--danger-red)' }}>Crawl Failed</h3>
              {crawlError && <p className="text-sm" style={{ color: 'var(--text-muted)', margin: '0.5rem 0', fontFamily: 'var(--font-mono)' }}>{crawlError}</p>}
              <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
                This may be due to a JS-rendered site or network issue. You can add products manually.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button id="retry-crawl-btn" className="btn btn-primary" onClick={startCrawl}>Retry Crawl</button>
                <button className="btn btn-ghost" onClick={() => navigate('/guardrails')}>Skip to Guardrails</button>
              </div>
            </div>
          )}
        </div>

        {/* Products Table */}
        {products.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Package size={20} color="var(--text-accent)" />
                <h3>Imported Products ({products.length})</h3>
              </div>
              <button id="recrawl-top-btn" className="btn btn-primary btn-sm" onClick={startCrawl} disabled={loading}>
                <RefreshCw size={14} /> {loading ? 'Starting...' : 'Re-Crawl Store'}
              </button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Category</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.slice(0, 20).map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', background: 'var(--bg-elevated)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Package size={16} color="var(--text-muted)" />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{p.name}</div>
                            {p.external_id && <div className="font-mono text-xs text-muted">{p.external_id}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span style={{ color: 'var(--neon-emerald)', fontWeight: 600 }}>₹{p.price.toLocaleString()}</span></td>
                      <td>
                        <span style={{ color: p.stock_qty === 100 ? 'var(--warm-amber)' : 'var(--text-secondary)' }}>
                          {p.stock_qty}{p.stock_qty === 100 && ' (est.)'}
                        </span>
                      </td>
                      <td>{p.category || '—'}</td>
                      <td>
                        <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.length > 20 && (
                <p className="text-center text-sm text-muted" style={{ padding: '0.75rem' }}>
                  Showing 20 of {products.length} products
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
