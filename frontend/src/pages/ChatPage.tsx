import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ExternalLink, ShoppingCart, Shield, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import { chatApi, ordersApi, type ChatResponse } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  step?: string;
  paymentLink?: string;
  guardrailDecision?: string;
  guardrailReason?: string;
  fallbackTriggered?: boolean;
  orderId?: string;
  llmUsed?: string;
  matchedProducts?: any[];
  timestamp: Date;
}

const STEP_LABELS: Record<string, string> = {
  'Parsing intent...': '🧠 Parsing intent',
  'Searching catalog...': '🔍 Searching catalog',
  'Checking availability...': '📦 Checking stock',
  'Checking discount eligibility...': '💰 Checking discount',
  'Running guardrail checks...': '🛡️ Guardrail check',
  'Guardrail check complete.': '✅ Guardrail done',
  'Payment link ready!': '🔗 Payment ready',
  'Awaiting merchant approval': '⏳ Sent for approval',
  'Payment gateway issue — handling gracefully...': '⚠️ Gateway issue',
  'Handled gracefully': '✅ Handled',
  'Greeting': '👋 Greeting',
  'Done': '✅ Done',
};

const SUGGESTED_MESSAGES = [
  'Hi! What products do you have?',
  'I want to buy Wireless Noise-Canceling Headphones with 10% discount',
  'Can I get 2 Smart Fitness Watches?',
  'I want to buy Ergonomic Mechanical Keyboard with 20% off',
];

const DEFAULT_MESSAGES: Message[] = [
  {
    id: 'welcome',
    role: 'agent',
    content: "👋 Hi! I'm your AI shopping assistant. I can help you browse products, check prices, and complete your purchase — all in one conversation. What are you looking for today?",
    llmUsed: 'Gemini 2.5 Flash',
    timestamp: new Date(),
  },
];

export default function ChatPage() {
  const { user } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = sessionStorage.getItem('aibuyable_chat_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Revive dates
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      } catch (e) {
        return DEFAULT_MESSAGES;
      }
    }
    return DEFAULT_MESSAGES;
  });
  
  const [input, setInput] = useState('');

  // Persist messages
  useEffect(() => {
    sessionStorage.setItem('aibuyable_chat_session', JSON.stringify(messages));
  }, [messages]);

  // Polling for HITL orders & Payment completion
  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. Find unresolved HITL orders
      const pendingHitl = messages
        .filter(m => m.guardrailDecision === 'hitl_required' && m.orderId)
        .map(m => m.orderId!);

      const resolvedHitl = messages
        .filter(m => m.paymentLink && m.orderId)
        .map(m => m.orderId!);

      const unresolvedHitl = pendingHitl.filter(id => 
        !resolvedHitl.includes(id) && 
        !messages.some(m => m.orderId === id && m.content.includes('declined'))
      );

      // 2. Find unresolved Payments (orders with a payment link, but not yet paid)
      const pendingPayment = messages
        .filter(m => m.paymentLink && m.orderId)
        .map(m => m.orderId!);

      const resolvedPayment = messages
        .filter(m => m.content.includes('Payment completed successfully') && m.orderId)
        .map(m => m.orderId!);

      const unresolvedPayment = pendingPayment.filter(id => !resolvedPayment.includes(id));

      // 3. Process HITL polling
      for (const orderId of unresolvedHitl) {
        try {
          const order = await ordersApi.getOrder(orderId);
          if (order.status === 'approved' && order.razorpay_payment_link_url) {
            setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              role: 'agent',
              content: '✅ The merchant has approved your order! You can now proceed to payment.',
              paymentLink: order.razorpay_payment_link_url,
              orderId: orderId,
              timestamp: new Date(),
            }]);
          } else if (order.status === 'cancelled') {
            setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              role: 'agent',
              content: `❌ The merchant has declined the order request. Reason: ${order.failure_reason || 'Not specified'}`,
              orderId: orderId,
              timestamp: new Date(),
            }]);
          }
        } catch (err) {
          console.error("Error polling HITL order", err);
        }
      }

      // 4. Process Payment polling
      for (const orderId of unresolvedPayment) {
        try {
          const order = await ordersApi.getOrder(orderId);
          if (order.status === 'paid') {
            setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              role: 'agent',
              content: '✅ Payment completed successfully! Thank you for your purchase. 🎉',
              orderId: orderId,
              timestamp: new Date(),
            }]);
          }
        } catch (err) {
          console.error("Error polling payment order", err);
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [messages]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || !user || sending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Add typing indicator
    const typingId = `typing-${Date.now()}`;
    setMessages(prev => [...prev, { id: typingId, role: 'agent', content: '__typing__', timestamp: new Date() }]);

    try {
      const res: ChatResponse = await chatApi.sendMessage(user.merchantId, messageText);

      setMessages(prev => prev.filter(m => m.id !== typingId).concat({
        id: Date.now().toString(),
        role: 'agent',
        content: res.final_message,
        step: res.current_step,
        paymentLink: res.payment_link_url || undefined,
        guardrailDecision: res.guardrail_decision || undefined,
        guardrailReason: res.guardrail_reason || undefined,
        fallbackTriggered: res.fallback_triggered,
        orderId: res.order_id || undefined,
        llmUsed: res.llm_used,
        matchedProducts: res.matched_products || undefined,
        timestamp: new Date(),
      }));
    } catch (err: unknown) {
      setMessages(prev => prev.filter(m => m.id !== typingId).concat({
        id: Date.now().toString(),
        role: 'agent',
        content: `⚠️ Connection error: ${(err as Error).message || 'Failed to reach the server'}. Please try again.`,
        timestamp: new Date(),
      }));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="main-content" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', height: 'calc(100vh - 100px)' }}>
        {/* Chat Window */}
        <div className="chat-container">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-agent-avatar">
              <Bot size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>AIBuyable AI Buyer</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--neon-emerald)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--neon-emerald)', display: 'inline-block' }} />
                Live — Real Razorpay, Real Catalog
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-blue">LangGraph</span>
              <span className="badge badge-green">Gemini</span>
              <button 
                className="btn btn-ghost btn-sm" 
                style={{ padding: '0.25rem 0.5rem', color: 'var(--text-muted)' }}
                onClick={() => setMessages(DEFAULT_MESSAGES)}
                title="Clear Chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map(msg => {
              if (msg.content === '__typing__') {
                return (
                  <div key={msg.id} className="message agent">
                    <div className="chat-agent-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem', flexShrink: 0 }}>AI</div>
                    <div className="typing-indicator">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`message ${msg.role}`}>
                  {msg.role === 'agent' && (
                    <div className="chat-agent-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem', flexShrink: 0 }}>
                      <Bot size={16} color="#fff" />
                    </div>
                  )}
                  {msg.role === 'user' && (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={16} color="var(--text-muted)" />
                    </div>
                  )}
                  <div style={{ maxWidth: '70%' }}>
                    {msg.role === 'agent' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        {msg.step && msg.step !== 'Done' && (
                          <div className="step-badge" style={{ marginBottom: 0 }}>
                            <span className="pulse-dot" />
                            {STEP_LABELS[msg.step] || msg.step}
                          </div>
                        )}
                        {msg.llmUsed && (
                          <span style={{
                            fontSize: '0.68rem',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: msg.llmUsed.includes('Gemini') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: msg.llmUsed.includes('Gemini') ? 'var(--neon-emerald)' : 'var(--warm-amber)',
                            border: msg.llmUsed.includes('Gemini') ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontWeight: 500
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: msg.llmUsed.includes('Gemini') ? 'var(--neon-emerald)' : 'var(--warm-amber)', display: 'inline-block' }} />
                            {msg.llmUsed}
                          </span>
                        )}
                      </div>
                    )}

                    <div className={`message-bubble`} style={{
                      background: msg.role === 'user' ? 'var(--gradient-blue)' : 'var(--bg-elevated)',
                      border: msg.role === 'agent' ? '1px solid var(--border-card)' : 'none',
                      color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                      borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                    }}>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.content}</div>

                      {/* Interactive Matched Product Cards with Buy Now buttons */}
                      {msg.matchedProducts && msg.matchedProducts.length > 0 && (
                        <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                          {msg.matchedProducts.map((p, idx) => (
                            <div key={p.id || idx} style={{
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border-card)',
                              borderRadius: '8px',
                              padding: '0.75rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.75rem'
                            }}>
                              {p.image_url && (
                                <img src={p.image_url} alt={p.name} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--neon-emerald)', fontWeight: 600 }}>₹{p.price.toLocaleString()}</div>
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', flexShrink: 0, gap: '0.35rem' }}
                                onClick={() => sendMessage(`buy ${p.name}`)}
                              >
                                <ShoppingCart size={13} /> Buy Now
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Payment Link Card */}
                      {msg.paymentLink && (
                        <div className="payment-link-card" style={{ marginTop: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={16} color="var(--neon-emerald)" />
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>Payment Link Ready</span>
                          </div>
                          <a
                            href={msg.paymentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            id={`payment-link-${msg.orderId}`}
                            className="btn btn-success btn-sm"
                          >
                            Pay Now <ExternalLink size={14} />
                          </a>
                        </div>
                      )}

                      {/* HITL Escalation Notice */}
                      {msg.guardrailDecision === 'hitl_required' && !msg.paymentLink && (
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.25)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <Shield size={14} color="var(--warm-amber)" />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--warm-amber)' }}>Guardrail Triggered</span>
                          </div>
                          {msg.guardrailReason && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{msg.guardrailReason}</p>}
                        </div>
                      )}

                      {/* Fallback Notice */}
                      {msg.fallbackTriggered && (
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={14} color="var(--danger-red)" />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--danger-red)' }}>Handled Gracefully</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-area">
            <textarea
              id="chat-input"
              className="chat-input"
              placeholder="Type your shopping request... (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={sending}
            />
            <button
              id="chat-send-btn"
              className="btn btn-primary"
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
              style={{ flexShrink: 0, alignSelf: 'flex-end' }}
            >
              <Send size={18} />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {/* Try These */}
          <div className="card">
            <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>💡 Try These</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {SUGGESTED_MESSAGES.map((msg, i) => (
                <button
                  key={i}
                  id={`suggested-msg-${i}`}
                  className="btn btn-ghost btn-sm"
                  style={{ textAlign: 'left', whiteSpace: 'normal', height: 'auto', padding: '0.625rem 0.875rem' }}
                  onClick={() => sendMessage(msg)}
                  disabled={sending}
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="card">
            <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>⚙️ How It Works</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { icon: '🧠', label: 'Gemini AI', desc: 'Parses your intent' },
                { icon: '📦', label: 'Live Catalog', desc: 'Checks real stock & prices' },
                { icon: '🛡️', label: 'Guardrails', desc: 'Enforced in code, not AI' },
                { icon: '💳', label: 'Razorpay', desc: 'Real test-mode payment link' },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem', width: 28 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Note about live */}
          <div style={{ padding: '0.875rem', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <p style={{ fontSize: '0.775rem', color: 'var(--neon-emerald)', lineHeight: 1.5, margin: 0 }}>
              <strong>🟢 Fully Live</strong> — No mocking, no scripts. Every message invokes the real LangGraph pipeline with Gemini, your live catalog, and real Razorpay test-mode API.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
