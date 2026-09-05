import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Package, Search, Save, CheckCircle, AlertTriangle,
  ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Globe,
} from 'lucide-react';
import { merchantApi, type Product } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const PAGE_SIZE = 25;
const CURRENCIES = ['INR', 'GBP', 'USD', 'EUR', 'CAD', 'AUD'];

type RowState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface EditableProduct extends Product {
  _draft: Partial<Product>;
  _rowState: RowState;
}

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ElementType }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className={`stat-card-icon ${color}`}><Icon size={18} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function CatalogPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<EditableProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const raw = await merchantApi.getAllProducts(user.merchantId);
      setProducts(raw.map(p => ({ ...p, _draft: {}, _rowState: 'idle' })));
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Derived stats
  const stats = useMemo(() => ({
    total: products.length,
    active: products.filter(p => {
      const draft = p._draft as Partial<Product>;
      return ('is_active' in draft ? draft.is_active : p.is_active);
    }).length,
    noPrice: products.filter(p => {
      const draft = p._draft as Partial<Product>;
      const price = 'price' in draft ? draft.price : p.price;
      return (price ?? 0) === 0;
    }).length,
  }), [products]);

  // Unique categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [products]);

  // Filtered + paginated
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q);
      const matchCat = !categoryFilter || p.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [products, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [search, categoryFilter]);

  function setDraft(productId: string, field: keyof Product, value: unknown) {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const newDraft = { ...p._draft, [field]: value };
      return { ...p, _draft: newDraft, _rowState: 'dirty' };
    }));
  }

  function getField<K extends keyof Product>(p: EditableProduct, key: K): Product[K] {
    return (key in p._draft ? p._draft[key] : p[key]) as Product[K];
  }

  async function saveProduct(productId: string) {
    const p = products.find(x => x.id === productId);
    if (!p || !user) return;
    if (Object.keys(p._draft).length === 0) return;

    setProducts(prev => prev.map(x => x.id === productId ? { ...x, _rowState: 'saving' } : x));
    try {
      const updated = await merchantApi.updateProduct(user.merchantId, productId, p._draft);
      setProducts(prev => prev.map(x =>
        x.id === productId
          ? { ...updated, _draft: {}, _rowState: 'saved' }
          : x
      ));
      // Reset saved → idle after 1.5s
      setTimeout(() => {
        setProducts(prev => prev.map(x =>
          x.id === productId && x._rowState === 'saved' ? { ...x, _rowState: 'idle' } : x
        ));
      }, 1500);
    } catch {
      setProducts(prev => prev.map(x => x.id === productId ? { ...x, _rowState: 'error' } : x));
      toast.error(`Failed to save "${p.name}"`);
      setTimeout(() => {
        setProducts(prev => prev.map(x =>
          x.id === productId && x._rowState === 'error' ? { ...x, _rowState: 'dirty' } : x
        ));
      }, 2000);
    }
  }

  function rowBg(p: EditableProduct) {
    const price = getField(p, 'price');
    if (p._rowState === 'saved') return 'rgba(16,185,129,0.06)';
    if (price === 0) return 'rgba(245,158,11,0.07)';
    return '';
  }

  function rowBorder(p: EditableProduct) {
    const price = getField(p, 'price');
    if (p._rowState === 'saved') return '2px solid var(--neon-emerald)';
    if (price === 0) return '2px solid var(--warm-amber)';
    return '2px solid transparent';
  }

  if (loading) {
    return (
      <div className="main-content">
        <div className="page-header">
          <h2>Product Catalog</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div className="main-content">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'var(--gradient-blue)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={22} color="#fff" />
          </div>
          <div>
            <h2>Product Catalog</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Review and edit all scraped products. Fix prices, categories, and toggle visibility.
            </p>
          </div>
        </div>
        <Link to="/crawl" className="btn btn-ghost btn-sm">
          <Globe size={14} /> Re-Crawl Store
        </Link>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: '1.5rem' }}>
        <StatCard label="Total Products" value={stats.total} color="blue" icon={Package} />
        <StatCard label="Active & Visible" value={stats.active} color="green" icon={CheckCircle} />
        <StatCard label="Needs Price Fix" value={stats.noPrice} color="amber" icon={AlertTriangle} />
      </div>

      {/* Price warning banner */}
      {stats.noPrice > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', padding: '0.875rem 1.25rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertTriangle size={18} color="var(--warm-amber)" style={{ flexShrink: 0 }} />
          <div>
            <span style={{ color: 'var(--warm-amber)', fontWeight: 600 }}>{stats.noPrice} products have no price set</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> — they are highlighted below. Set a price to make them visible to the AI chatbot.</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {products.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Package size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>No products yet</h3>
          <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>Run the crawler to import your product catalog first.</p>
          <Link to="/crawl" className="btn btn-primary">Go to Catalog Ingestion →</Link>
        </div>
      )}

      {products.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '1rem 1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                id="catalog-search"
                type="text"
                placeholder="Search by name or category…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>
            {/* Category filter */}
            <select
              id="catalog-category-filter"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{
                padding: '8px 12px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)', fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* Result count */}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {filtered.length} of {products.length} products
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['', 'Product Name', 'Price', 'Currency', 'Category', 'Stock', 'Visible', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(p => {
                  const price = getField(p, 'price');
                  const name = getField(p, 'name');
                  const currency = getField(p, 'currency');
                  const category = getField(p, 'category') ?? '';
                  const stock = getField(p, 'stock_qty');
                  const isActive = getField(p, 'is_active');
                  const noPrice = price === 0;

                  return (
                    <tr
                      key={p.id}
                      style={{
                        background: rowBg(p),
                        borderLeft: rowBorder(p),
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.3s',
                      }}
                    >
                      {/* Thumbnail */}
                      <td style={{ padding: '8px 10px', width: 52 }}>
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: 'var(--bg-elevated)', display: 'block' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={16} color="var(--text-muted)" />
                          </div>
                        )}
                      </td>

                      {/* Name */}
                      <td style={{ padding: '8px 8px', minWidth: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {noPrice && <AlertTriangle size={13} color="var(--warm-amber)" style={{ flexShrink: 0 }} title="No price set" />}
                          <input
                            type="text"
                            value={name}
                            onChange={e => setDraft(p.id, 'name', e.target.value)}
                            style={{
                              width: '100%', padding: '5px 8px',
                              background: 'transparent', border: '1px solid transparent',
                              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                              fontSize: '0.85rem', fontWeight: 500, transition: 'border-color 0.2s',
                            }}
                            onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; e.target.style.background = 'var(--bg-elevated)'; }}
                            onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
                          />
                        </div>
                        {p.external_id && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', paddingLeft: noPrice ? 21 : 0, marginTop: 2 }}>
                            {p.external_id.slice(0, 30)}
                          </div>
                        )}
                      </td>

                      {/* Price */}
                      <td style={{ padding: '8px 8px', width: 100 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={price}
                          onChange={e => setDraft(p.id, 'price', parseFloat(e.target.value) || 0)}
                          style={{
                            width: 90, padding: '5px 8px',
                            background: noPrice ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)',
                            border: `1px solid ${noPrice ? 'var(--warm-amber)' : 'var(--border-subtle)'}`,
                            borderRadius: 'var(--radius-sm)', color: noPrice ? 'var(--warm-amber)' : 'var(--neon-emerald)',
                            fontSize: '0.875rem', fontWeight: 600,
                          }}
                        />
                      </td>

                      {/* Currency */}
                      <td style={{ padding: '8px 8px', width: 80 }}>
                        <select
                          value={currency}
                          onChange={e => setDraft(p.id, 'currency', e.target.value)}
                          style={{
                            padding: '5px 6px', background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', width: 72,
                          }}
                        >
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '8px 8px', minWidth: 110 }}>
                        <input
                          type="text"
                          value={category}
                          onChange={e => setDraft(p.id, 'category', e.target.value)}
                          placeholder="Uncategorised"
                          style={{
                            width: '100%', padding: '5px 8px',
                            background: 'transparent', border: '1px solid transparent',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
                            fontSize: '0.8rem', transition: 'border-color 0.2s',
                          }}
                          onFocus={e => { e.target.style.borderColor = 'var(--electric-blue)'; e.target.style.background = 'var(--bg-elevated)'; }}
                          onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
                        />
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '8px 8px', width: 76 }}>
                        <input
                          type="number"
                          min="0"
                          value={stock}
                          onChange={e => setDraft(p.id, 'stock_qty', parseInt(e.target.value) || 0)}
                          style={{
                            width: 66, padding: '5px 8px',
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
                            fontSize: '0.875rem',
                          }}
                        />
                      </td>

                      {/* Active toggle */}
                      <td style={{ padding: '8px 12px', width: 70, textAlign: 'center' }}>
                        <button
                          onClick={() => setDraft(p.id, 'is_active', !isActive)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title={isActive ? 'Click to deactivate' : 'Click to activate'}
                        >
                          {isActive
                            ? <ToggleRight size={26} color="var(--neon-emerald)" />
                            : <ToggleLeft size={26} color="var(--text-muted)" />
                          }
                        </button>
                      </td>

                      {/* Save */}
                      <td style={{ padding: '8px 12px', width: 90 }}>
                        {p._rowState === 'saved' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--neon-emerald)', fontSize: '0.8rem', fontWeight: 600 }}>
                            <CheckCircle size={15} /> Saved
                          </div>
                        ) : (
                          <button
                            id={`save-product-${p.id.slice(0, 8)}`}
                            className="btn btn-sm"
                            disabled={p._rowState === 'saving' || p._rowState === 'idle'}
                            onClick={() => saveProduct(p.id)}
                            style={{
                              background: p._rowState === 'dirty' ? 'var(--electric-blue)' : 'var(--bg-elevated)',
                              color: p._rowState === 'dirty' ? '#fff' : 'var(--text-muted)',
                              border: `1px solid ${p._rowState === 'dirty' ? 'var(--electric-blue)' : 'var(--border-subtle)'}`,
                              transition: 'all 0.2s',
                              display: 'flex', alignItems: 'center', gap: 5,
                              cursor: p._rowState === 'dirty' ? 'pointer' : 'default',
                            }}
                          >
                            {p._rowState === 'saving' ? (
                              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            ) : (
                              <Save size={13} />
                            )}
                            {p._rowState === 'saving' ? 'Saving' : 'Save'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong>
                <span style={{ marginLeft: '0.5rem' }}>({filtered.length} products)</span>
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
