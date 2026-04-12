// src/components/shared/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const STUDENT_NAV = [
  { to: '/dashboard',       icon: '🏠', label: 'Dashboard' },
  { to: '/exams',           icon: '📝', label: 'Start Exam' },
  { to: '/daily-practice',  icon: '⚡', label: 'Daily Practice' },
  { to: '/course-drill',    icon: '📖', label: 'Course Drill' },
  { to: '/topic-drill',     icon: '🎯', label: 'Topic Drill' },
  { to: '/mock-exams',      icon: '📋', label: 'Mock Exams' },
  { to: '/mock-reviews',    icon: '🗂️', label: 'Mock Reviews' },
  { to: '/bookmarks',       icon: '🔖', label: 'Bookmarked' },
  { to: '/results',         icon: '📊', label: 'My Results' },
  { to: '/leaderboard',     icon: '🏆', label: 'Leaderboard' },
  { to: '/subscription',    icon: '💳', label: 'Subscription' },
  { to: '/profile',         icon: '👤', label: 'Profile' },
];

const ADMIN_NAV = [
  { to: '/admin',                 icon: '🛡️',  label: 'Admin Overview' },
  { to: '/admin/questions',       icon: '❓',  label: 'Questions' },
  { to: '/admin/users',           icon: '👥',  label: 'Users' },
  { to: '/admin/payments',        icon: '💰',  label: 'Payments' },
  { to: '/admin/access-codes',    icon: '🔑',  label: 'Access Codes' },
  { to: '/admin/announcements',   icon: '📢',  label: 'Announcements' },
  { to: '/admin/analytics',       icon: '📈',  label: 'Analytics' },
  { to: '/dashboard',             icon: '🏠',  label: 'Student View' },
];

export default function Sidebar({ open, onClose }) {
  const { profile, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const navItems = isAdmin ? ADMIN_NAV : STUDENT_NAV;

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 199, display: 'none',
          }}
          onClick={onClose}
          className="sidebar-overlay"
        />
      )}

      <aside className={`sidebar${open ? ' open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>📚</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, color: '#fff', fontSize: 16 }}>
                NMCN CBT
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {isAdmin ? '🛡️ Admin Mode' : '🎓 Student Mode'}
              </div>
            </div>
          </div>
        </div>

        {/* User badge */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0D9488, #7C3AED)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#fff', fontSize: 15,
            }}>
              {(profile?.name || 'S')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.name || 'Student'}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                {profile?.subscribed ? '✅ Subscribed' : '🔒 Free Plan'}
              </div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          <ul className="sidebar-nav" style={{ padding: 0 }}>
            {navItems.map(item => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/dashboard' || item.to === '/admin'}
                  className={({ isActive }) => isActive ? 'active' : ''}
                  onClick={onClose}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={async () => { await logout(); navigate('/'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 14px', background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10,
              color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}