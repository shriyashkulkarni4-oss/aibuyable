import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, ShoppingCart, ArrowRight, Receipt, Loader } from 'lucide-react';

type ResultStatus = 'loading' | 'success' | 'failed' | 'error';

export default function PaymentResultPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<ResultStatus>('loading');
  const confettiRef = useRef<HTMLCanvasElement>(null);

  const orderId = params.get('order_id') || '';
  const amount = params.get('amount') || '0';
  const paymentId = params.get('payment_id') || '';
  const rawStatus = params.get('status') || '';

  useEffect(() => {
    if (rawStatus === 'success') {
      setStatus('success');
      startConfetti();
    } else if (rawStatus === 'failed') {
      setStatus('failed');
    } else if (rawStatus === 'error') {
      setStatus('error');
    } else {
      setStatus('loading');
      const t = setTimeout(() => setStatus('error'), 5000);
      return () => clearTimeout(t);
    }
  }, [rawStatus]);

  function startConfetti() {
    const canvas = confettiRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces: { x: number; y: number; r: number; d: number; color: string; tilt: number; tiltAngleIncremental: number; tiltAngle: number }[] = [];
    const colors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];
    for (let i = 0; i < 160; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 6 + 4,
        d: Math.random() * 80 + 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngleIncremental: Math.random() * 0.07 + 0.05,
        tiltAngle: 0,
      });
    }

    let angle = 0;
    let frame: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.01;
      pieces.forEach((p) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(angle + p.d) + 2) * 1.5;
        p.tilt = Math.sin(p.tiltAngle) * 12;
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 3, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 5);
        ctx.stroke();
        if (p.y > canvas.height) {
          p.x = Math.random() * canvas.width;
          p.y = -10;
        }
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    setTimeout(() => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 4000);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Confetti canvas */}
      <canvas ref={confettiRef} style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }} />

      {/* Ambient glow */}
      {status === 'success' && (
        <div style={{
          position: 'fixed', top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}

      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center', position: 'relative', zIndex: 2 }}>

        {/* Loading */}
        {status === 'loading' && (
          <div className="card" style={{ padding: '3rem' }}>
            <Loader size={48} color="var(--electric-blue)" style={{ marginBottom: '1.5rem', animation: 'spin 1s linear infinite' }} />
            <h2 style={{ marginBottom: '0.5rem' }}>Verifying Payment…</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Please wait while we confirm your transaction.</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* SUCCESS */}
        {status === 'success' && (
          <div className="card" style={{ padding: '3rem 2.5rem' }}>
            {/* Icon */}
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'rgba(16,185,129,0.15)',
              border: '2px solid rgba(16,185,129,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
              animation: 'popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275)',
            }}>
              <CheckCircle size={44} color="var(--neon-emerald)" />
            </div>

            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              Payment Successful! 🎉
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '2rem' }}>
              Your order has been confirmed and stock has been updated.
            </p>

            {/* Amount */}
            <div style={{
              padding: '1.25rem',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--neon-emerald)', letterSpacing: '-0.02em' }}>
                ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Amount Paid</div>
            </div>

            {/* Order details */}
            <div style={{
              padding: '1rem 1.25rem',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '2rem',
              textAlign: 'left',
              display: 'flex', flexDirection: 'column', gap: '0.625rem',
            }}>
              {[
                { label: 'Order ID', value: orderId.slice(0, 18) + '…', mono: true },
                { label: 'Payment ID', value: paymentId || '—', mono: true },
                { label: 'Status', value: '✅ Paid & Confirmed' },
              ].map(({ label, value, mono }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{
                    fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500,
                    fontFamily: mono ? 'var(--font-mono)' : 'inherit',
                  }}>{value}</span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link to="/orders" className="btn btn-primary" style={{ justifyContent: 'center', gap: '0.5rem' }}>
                <Receipt size={16} /> View Order Details <ArrowRight size={16} />
              </Link>
              <Link to="/chat" className="btn btn-ghost" style={{ justifyContent: 'center' }}>
                <ShoppingCart size={16} /> Continue Shopping
              </Link>
            </div>
          </div>
        )}

        {/* FAILED */}
        {(status === 'failed' || status === 'error') && (
          <div className="card" style={{ padding: '3rem 2.5rem' }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)',
              border: '2px solid rgba(239,68,68,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}>
              <XCircle size={44} color="var(--danger-red)" />
            </div>

            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              {status === 'error' ? 'Something went wrong' : 'Payment Failed'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
              {status === 'error'
                ? 'We could not verify your payment. If you were charged, please contact support.'
                : 'Your payment was not completed. No charges were made. You can try again.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link to="/chat" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                Try Again
              </Link>
              <Link to="/orders" className="btn btn-ghost" style={{ justifyContent: 'center' }}>
                View Orders
              </Link>
            </div>
          </div>
        )}

        {/* Brand footer */}
        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <div style={{ width: 22, height: 22, background: 'var(--gradient-blue)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 700 }}>⚡</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Powered by <strong style={{ color: 'var(--text-secondary)' }}>AIBuyable</strong></span>
        </div>
      </div>

      <style>{`
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
