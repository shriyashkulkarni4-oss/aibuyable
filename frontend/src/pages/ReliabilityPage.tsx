import React, { useState } from 'react';
import { Zap, AlertTriangle, Clock, CreditCard, Link, CheckCircle, Info } from 'lucide-react';
import { internalApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

type FaultType = 'timeout' | 'insufficient_funds' | 'expired_link';

interface FaultResult {
  fault_type: string;
  buyer_facing_message: string;
  order_id?: string;
  audit_step: string;
  audit_reason: string;
  order_status: string;
}

const FAULT_CONFIG = {
  timeout: {
    icon: Clock,
    color: 'var(--warm-amber)',
    title: 'Razorpay 504 / Timeout',
    desc: 'Simulates a gateway timeout. The agent retries once, saves the order as pending, and tells the buyer they won\'t be charged twice.',
    expectedMsg: '"Payment gateway is momentarily unavailable — I\'ve saved your order and will retry automatically."',
  },
  insufficient_funds: {
    icon: CreditCard,
    color: 'var(--danger-red)',
    title: 'Insufficient Funds',
    desc: 'Simulates a payment failure due to insufficient funds. The agent marks the order failed and offers to retry with a different method.',
    expectedMsg: '"Your payment didn\'t go through due to insufficient funds."',
  },
  expired_link: {
    icon: Link,
    color: '#8B5CF6',
    title: 'Expired Payment Link',
    desc: 'Simulates a payment link expiry. The agent automatically issues a fresh link tied to the same order (no duplicate order created).',
    expectedMsg: '"That payment link expired — here\'s a fresh one, valid for 15 minutes."',
  },
};

export default function ReliabilityPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<string, FaultResult | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const runFault = async (faultType: FaultType) => {
    if (!user) return;
    setLoading(prev => ({ ...prev, [faultType]: true }));
    try {
      const res = await internalApi.injectFault(faultType) as FaultResult;
      setResults(prev => ({ ...prev, [faultType]: res }));
    } catch (err: unknown) {
      setResults(prev => ({ ...prev, [faultType]: { fault_type: faultType, buyer_facing_message: (err as Error).message, audit_step: 'error', audit_reason: 'Failed to inject fault', order_status: 'unknown' } }));
    } finally {
      setLoading(prev => ({ ...prev, [faultType]: false }));
    }
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={22} color="#fff" />
          </div>
          <div>
            <h2>Fault-Injection Reliability Panel</h2>
            <p>Internal operational tooling — verify real fallback behavior end-to-end</p>
          </div>
        </div>
      </div>

      {/* Notice */}
      <div style={{ marginBottom: '2rem', padding: '1.25rem', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Info size={18} color="#A78BFA" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ color: '#A78BFA', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>How This Works</p>
            <p className="text-sm text-muted">
              Each button runs the <strong style={{ color: 'var(--text-secondary)' }}>exact real checkout pipeline</strong> with a controlled fault injected <em>only</em> at the Razorpay HTTP call boundary. 
              All upstream logic — pricing, guardrail checks, audit logging — runs identically to a real buyer order. 
              The result you see is what a real buyer would see if Razorpay failed in production.
            </p>
            <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)', marginTop: '0.5rem' }}>
              ⚠️ This panel is not accessible to the buyer chatbot or external API — those paths always use real Razorpay.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {(Object.entries(FAULT_CONFIG) as [FaultType, typeof FAULT_CONFIG[FaultType]][]).map(([faultType, config]) => {
          const Icon = config.icon;
          const result = results[faultType];
          const isLoading = loading[faultType];

          return (
            <div key={faultType} className="card" style={{ borderTop: `2px solid ${config.color}` }}>
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${config.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={config.color} />
                </div>
                <h4 style={{ fontSize: '1rem' }}>{config.title}</h4>
              </div>

              <p className="text-sm text-muted" style={{ marginBottom: '0.875rem', lineHeight: 1.6 }}>
                {config.desc}
              </p>

              <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
                <p className="text-xs text-muted" style={{ marginBottom: '0.25rem', fontWeight: 600 }}>Expected buyer message:</p>
                <p className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{config.expectedMsg}</p>
              </div>

              <button
                id={`inject-${faultType}`}
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center', marginBottom: '1rem' }}
                onClick={() => runFault(faultType)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <><span className="crawl-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Running real pipeline...</>
                ) : (
                  <><Zap size={16} /> Inject {config.title}</>
                )}
              </button>

              {/* Result */}
              {result && (
                <div style={{ padding: '1rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <CheckCircle size={16} color="var(--neon-emerald)" />
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--neon-emerald)' }}>Real pipeline executed</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Order Status:</span>
                      <span className={`badge ${result.order_status === 'pending' ? 'badge-amber' : 'badge-red'}`}>{result.order_status}</span>
                    </div>
                    {result.order_id && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Order ID:</span>
                        <span className="font-mono" style={{ color: 'var(--text-accent)', fontSize: '0.75rem' }}>{result.order_id?.slice(0, 16)}...</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Audit Step:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{result.audit_step}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${config.color}` }}>
                    <p className="text-xs text-muted" style={{ marginBottom: '0.25rem', fontWeight: 600 }}>BUYER-FACING MESSAGE (real output):</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{result.buyer_facing_message}</p>
                  </div>

                  {result.order_id && (
                    <a
                      href={`/orders/${result.order_id}/audit`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.75rem', color: 'var(--text-accent)', fontSize: '0.8rem', textDecoration: 'none' }}
                    >
                      View Audit Trail → <AlertTriangle size={12} />
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
