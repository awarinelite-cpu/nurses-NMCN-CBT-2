// src/components/exam/DailyPracticePage.jsx
// Route: /daily-practice
//
// FLOW (NEW — Unified Pool):
//   Step 1 — Student taps "Start Daily Practice"
//   Step 2 — ExamSession (/exam/session) with poolMode:true
//            Pulls up to 250 random questions from ALL active questions
//            across every topic and course, excluding already-seen questions.
//
// No category picker needed — daily practice is deliberately cross-specialty.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

export default function DailyPracticePage() {
  const navigate   = useNavigate();
  const { user, profile } = useAuth();

  const [totalQs,  setTotalQs]  = useState(null);
  const [seenCount, setSeenCount] = useState(0);
  const [loading,  setLoading]  = useState(true);

  // Load quick stats so the student knows what to expect
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const snap = await getCountFromServer(
          query(collection(db, 'questions'), where('active', '==', true))
        );
        setTotalQs(snap.data().count);
        setSeenCount((profile?.seenQuestions || []).length);
      } catch {
        setTotalQs(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [profile]);

  const unseen   = totalQs !== null ? Math.max(0, totalQs - seenCount) : null;
  const poolSize = unseen !== null ? Math.min(unseen > 5 ? unseen : totalQs, 250) : 250;

  const handleStart = () => {
    navigate('/exam/session', {
      state: {
        poolMode:    true,
        examType:    'daily_practice',
        examName:    `Daily Practice — ${new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        doShuffle:   true,
        timeLimit:   0,   // no timer for daily practice
      },
    });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 700 }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 36 }}>⚡</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Daily Practice Quiz
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Mixed questions pulled randomly from <strong style={{ color: 'var(--text-primary)' }}>all topics and courses</strong> in the question bank.
          Every session feels fresh — seen questions are automatically skipped until the full pool is exhausted.
        </p>
      </div>

      {/* Stats card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
          Question Bank Status
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
            <span className="spinner spinner-sm" /> Loading stats…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Total Questions',   value: totalQs   ?? '—', color: 'var(--teal)',    icon: '📚' },
              { label: 'Already Seen',      value: seenCount,         color: '#F59E0B',        icon: '✅' },
              { label: 'Fresh Questions',   value: unseen    ?? '—', color: '#16A34A',        icon: '⚡' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Pool reset notice */}
        {!loading && unseen !== null && unseen < 10 && totalQs > 0 && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            fontSize: 12, color: '#F59E0B', fontWeight: 600,
          }}>
            🔄 You've seen most questions — the pool will reset and start fresh for this session.
          </div>
        )}
      </div>

      {/* How it works */}
      <div style={{
        background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)',
        borderRadius: 14, padding: '18px 20px', marginBottom: 28,
      }}>
        <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 12, fontSize: 13 }}>
          📋 How Daily Practice Works
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['⚡', 'Questions are picked randomly from ALL topics and courses'],
            ['🔀', 'Each session is unique — never the same set twice'],
            ['📈', 'Seen questions are skipped until the full pool is exhausted'],
            ['🔖', 'Bookmark any question during the session to review later'],
            ['💡', 'Full explanations shown after every session'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ flexShrink: 0 }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Session size notice */}
      {!loading && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, textAlign: 'center' }}>
          This session will contain up to <strong style={{ color: 'var(--text-primary)' }}>{poolSize} questions</strong>
          {unseen !== null && unseen > 0 && ` (${Math.min(unseen, 250)} fresh)`}.
        </div>
      )}

      {/* Start button */}
      <button
        className="btn btn-primary"
        onClick={handleStart}
        disabled={loading || totalQs === 0}
        style={{ width: '100%', padding: '16px', fontSize: 16, fontWeight: 800, borderRadius: 14 }}
      >
        {loading ? (
          <><span className="spinner spinner-sm" style={{ marginRight: 8 }} /> Loading…</>
        ) : totalQs === 0 ? (
          '📭 No questions available yet'
        ) : (
          '⚡ Start Daily Practice'
        )}
      </button>
    </div>
  );
}
