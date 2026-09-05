import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Zap, LayoutDashboard, Globe, Shield, MessageSquare, ShoppingCart, Clock, Zap as FaultIcon,
  Users, BarChart3, LogOut, Bot, BookOpen
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  id?: string;
}

function NavItem({ to, icon, label, id }: NavItemProps) {
  return (
    <NavLink
      to={to}
      id={id}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      {icon}
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ width: 32, height: 32, background: 'var(--gradient-blue)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.1rem', lineHeight: 1.2 }}>AIBuyable</h1>
            <span>Gateway v1.0</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isAdmin ? (
          <>
            <p className="nav-section-label">Admin</p>
            <NavItem to="/admin" icon={<BarChart3 size={18} />} label="Platform Dashboard" id="nav-admin" />
            <NavItem to="/admin/merchants" icon={<Users size={18} />} label="Merchants" id="nav-merchants" />
          </>
        ) : (
          <>
            <p className="nav-section-label">Commerce</p>
            <NavItem to="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" id="nav-dashboard" />
            <NavItem to="/chat" icon={<MessageSquare size={18} />} label="AI Buyer Chat" id="nav-chat" />
            <NavItem to="/hitl" icon={<Clock size={18} />} label="HITL Inbox" id="nav-hitl" />
            <NavItem to="/orders" icon={<ShoppingCart size={18} />} label="Orders" id="nav-orders" />

            <p className="nav-section-label" style={{ marginTop: '0.5rem' }}>Setup</p>
            <NavItem to="/crawl" icon={<Globe size={18} />} label="Catalog Ingestion" id="nav-crawl" />
            <NavItem to="/catalog" icon={<BookOpen size={18} />} label="Product Catalog" id="nav-catalog" />
            <NavItem to="/guardrails" icon={<Shield size={18} />} label="Guardrails" id="nav-guardrails" />

            <p className="nav-section-label" style={{ marginTop: '0.5rem' }}>Operations</p>
            <NavItem to="/reliability" icon={<FaultIcon size={18} />} label="Reliability Panel" id="nav-reliability" />
          </>
        )}
      </div>

      {/* User Footer — click to go to profile */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-subtle)' }}>
        {!isAdmin && (
          <NavLink
            to="/profile"
            id="nav-profile"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '0.5rem',
              textDecoration: 'none',
              background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
              border: isActive ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
              transition: 'all 0.15s',
              cursor: 'pointer',
            })}
          >
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gradient-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={16} color="#fff" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {user?.role} · Edit Profile
              </div>
            </div>
          </NavLink>
        )}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gradient-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BarChart3 size={16} color="#000" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {user?.role}
              </div>
            </div>
          </div>
        )}
        <button
          id="logout-btn"
          className="btn btn-ghost w-full btn-sm"
          style={{ justifyContent: 'center' }}
          onClick={handleLogout}
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </div>
  );
}
