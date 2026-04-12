// src/components/student/StudentDashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      try {
        const sessQ = query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
          limit(5)
        );
        const snap = await getDocs(sessQ);
        setRecentSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const totalExams = profile?.totalExams || 0;
  const totalScore = profile?.totalScore || 0;
  const avgScore   = totalExams > 0 ? Math.round(totalScore / totalExams) : 0;
  const streak     = profile?.streak        || 0;
  const bookmarks  = profile?.bookmarkCount || 0;

  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      {/* Greeting banner */}
      <div style={styles.banner}>
        <div style={styles.bannerGlow} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
            🏥 NMCN CBT Platform
          </div>
          <h2 style={{ color: '#fff', fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.3rem,3vw,1.8rem)', margin: 0 }}>
            {greet}, {(profile?.name || user?.displayName || 'Student').split(' ')[0]}! 👋
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: '6px 0 0' }}>
            {profile?.subscribed
              ? '🌟 Premium subscriber — all content unlocked'
              : '🎯 Free plan — upgrade to unlock all past questions'}
          </p>
        </div>
        <div style={styles.bannerActions}>
          <Link to="/exams" className="btn btn-gold btn-sm">⚡ Start Exam</Link>
          {!profile?.subscribed && (
            <Link to="/subscription" className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              Upgrade Plan
            </Link>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={styles.statsGrid}>
        {[
          { icon: '📝', label: 'Exams Taken', value: totalExams,     color: '#0D9488', bg: 'rgba(13,148,136,0.12)', to: null },
          { icon: '📊', label: 'Avg. Score',  value: `${avgScore}%`, color: '#2563EB', bg: 'rgba(37,99,235,0.12)',  to: null },
          { icon: '🔥', label: 'Day Streak',  value: streak,         color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', to: null },
          { icon: '🔖', label: 'Bookmarked',  value: bookmarks,      color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', to: '/bookmarks' },
        ].map(s => {
          const inner = (
            <>
              <div className="stat-icon" style={{ background: s.bg }}>
                <span>{s.icon}</span>
              </div>
              <div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </>
          );
          return s.to ? (
            <Link key={s.label} to={s.to} className="stat-card" style={{ textDecoration: 'none', cursor: 'pointer' }}>
              {inner}
            </Link>
          ) : (
            <div key={s.label} className="stat-card">{inner}</div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ ...styles.sectionTitle, marginBottom: 14 }}>⚡ Quick Actions</h3>
        <div style={styles.quickGrid}>

          <Link to="/daily-practice" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>⚡</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Daily Practice</span>
          </Link>

          <Link to="/course-drill" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>📖</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Course Drill</span>
          </Link>

          <Link to="/topic-drill" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>🎯</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Topic Drill</span>
          </Link>

          <Link to="/mock-exams" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>📋</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Mock Exams</span>
          </Link>

          <Link to="/past-questions" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>📜</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Past Questions</span>
          </Link>

          <Link to="/bookmarks" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>🔖</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Bookmarks</span>
          </Link>

        </div>
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={styles.sectionTitle}>🏥 Exam Categories</h3>
        </div>
        <div style={styles.categoriesGrid}>
          {NURSING_CATEGORIES.slice(0, 8).map(cat => (
            <div key={cat.id} style={styles.catCard}>
              <div style={{ ...styles.catIcon, background: `${cat.color}22` }}>
                {cat.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                  {cat.shortLabel}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {cat.examType === 'basic' ? 'Basic RN' : 'Post Basic'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={styles.sectionTitle}>🕓 Recent Exams</h3>
            <Link to="/results" style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 700 }}>All results →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th><th>Type</th><th>Score</th><th>Date</th><th></th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map(s => {
                  const cat = NURSING_CATEGORIES.find(c => c.id === s.category);
                  return (
                    <tr key={s.id}>
                      <td>{cat?.icon} {cat?.shortLabel || s.category}</td>
                      <td><span className="badge badge-teal">{s.examType}</span></td>
                      <td>
                        <span style={{
                          fontWeight: 700, color:
                            s.scorePercent >= 70 ? 'var(--green)' :
                            s.scorePercent >= 50 ? 'var(--gold)'  : 'var(--red)',
                        }}>
                          {s.scorePercent || 0}%
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.completedAt?.toDate
                          ? new Date(s.completedAt.toDate()).toLocaleDateString()
                          : 'Recently'}
                      </td>
                      <td>
                        <Link
                          to={`/exam/review?resultId=${s.id}&category=${s.category}&examType=${s.examType}`}
                          className="btn btn-ghost btn-sm"
                        >Review</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex-center" style={{ padding: 40 }}>
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}

const styles = {
  banner: {
    background: 'linear-gradient(135deg, #1E3A8A 0%, #0D9488 100%)',
    borderRadius: 20, padding: '28px 32px', marginBottom: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 16, position: 'relative', overflow: 'hidden',
  },
  bannerGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at 70% 50%, rgba(245,158,11,0.15) 0%, transparent 60%)',
  },
  bannerActions: { display: 'flex', gap: 10, flexShrink: 0 },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16, marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.1rem',
    color: 'var(--text-primary)', margin: 0,
  },
  quickGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12, marginTop: 14,
  },
  quickCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '20px 16px', background: 'var(--bg-card)',
    border: '1.5px solid var(--border)', borderRadius: 14,
    textDecoration: 'none', color: 'var(--text-primary)',
    transition: 'var(--transition)', textAlign: 'center',
    cursor: 'pointer', position: 'relative',
  },
  categoriesGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
  },
  catCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', background: 'var(--bg-card)',
    border: '1.5px solid var(--border)', borderRadius: 12,
  },
  catIcon: {
    width: 40, height: 40, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, flexShrink: 0,
  },
};