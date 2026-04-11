// src/components/exam/ExamReviewPage.jsx
//
// Standalone review page — loads a completed exam session from Firestore
// and shows every question with the student's answer highlighted.
//
// Route: /exam/review  (full-screen, no sidebar — registered in App.jsx)
//
// URL params:
//   archiveId  — "daily_{categoryId}_{YYYY-MM-DD}_{uid}"
//   category   — category id, used for display + fallback query
//   examType   — always 'daily_practice' for now
//   createdAt  — ISO string of when the archive doc was created (for fallback matching)
//   resultId   — optional: direct examSessions doc ID (set for new sessions)
//   mode       — 'review'

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  doc, getDoc,
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function ExamReviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const resultId  = searchParams.get('resultId')  || '';
  const archiveId = searchParams.get('archiveId') || '';
  const category  = searchParams.get('category')  || '';
  const createdAt = searchParams.get('createdAt') || '';

  const [session,   setSession]   = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplain, setAiExplain] = useState({});

  const catInfo = NURSING_CATEGORIES.find(c => c.id === category);

  useEffect(() => {
    if (!user?.uid) return;
    const load = async () => {
      setLoading(true);
      try {
        let sessionData = null;

        // Strategy 1: direct load by resultId
        if (resultId) {
          try {
            const snap = await getDoc(doc(db, 'examSessions', resultId));
            if (snap.exists()) sessionData = { id: snap.id, ...snap.data() };
          } catch (e) { console.warn('resultId load failed:', e); }
        }

        // Strategy 2: query by archiveId only (single field — no composite index needed)
        // Filter to this user in JS to avoid composite index requirement
        if (!sessionData && archiveId) {
          try {
            const snap = await getDocs(query(
              collection(db, 'examSessions'),
              where('archiveId', '==', archiveId),
            ));
            const mine = snap.docs
              .filter(d => d.data().userId === user.uid)
              .sort((a, b) => {
                const ta = a.data().completedAt?.toDate?.()?.getTime?.() || 0;
                const tb = b.data().completedAt?.toDate?.()?.getTime?.() || 0;
                return tb - ta;
              });
            if (mine.length > 0) sessionData = { id: mine[0].id, ...mine[0].data() };
          } catch (e) { console.warn('archiveId query failed:', e); }
        }

        // Strategy 3: query by userId only, filter by category + examType in JS
        // Handles old sessions saved before archiveId field existed
        if (!sessionData) {
          try {
            const snap = await getDocs(query(
              collection(db, 'examSessions'),
              where('userId', '==', user.uid),
            ));
            let candidates = snap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(d =>
                d.examType === 'daily_practice' &&
                (!category || d.category === category)
              );

            if (candidates.length > 0) {
              if (createdAt) {
                const archiveTime = new Date(createdAt).getTime();
                candidates.sort((a, b) => {
                  const ta = a.completedAt?.toDate?.()?.getTime?.() || 0;
                  const tb = b.completedAt?.toDate?.()?.getTime?.() || 0;
                  return Math.abs(ta - archiveTime) - Math.abs(tb - archiveTime);
                });
              } else {
                candidates.sort((a, b) => {
                  const ta = a.completedAt?.toDate?.()?.getTime?.() || 0;
                  const tb = b.completedAt?.toDate?.()?.getTime?.() || 0;
                  return tb - ta;
                });
              }
              sessionData = candidates[0];
            }
          } catch (e) { console.warn('userId fallback query failed:', e); }
        }

        if (!sessionData) {
          setError('No completed session found for this exam.');
          setLoading(false);
          return;
        }

        setSession(sessionData);

        // Load question docs
        // Use saved questionIds (full list) if available; fall back to answered keys for old sessions
        const savedAnswers = sessionData.answers || {};
        const questionIds  = sessionData.questionIds?.length > 0
          ? sessionData.questionIds
          : Object.keys(savedAnswers);

        if (questionIds.length === 0) {
          setLoading(false);
          return;
        }

        const allQs = [];
        for (let i = 0; i < questionIds.length; i += 30) {
          const chunk = questionIds.slice(i, i + 30);
          try {
            const qSnap = await getDocs(
              query(collection(db, 'questions'), where('__name__', 'in', chunk))
            );
            qSnap.docs.forEach(d => allQs.push({ id: d.id, ...d.data() }));
          } catch (e) { console.warn('question fetch failed:', e); }
        }

        allQs.sort((a, b) => questionIds.indexOf(a.id) - questionIds.indexOf(b.id));
        setQuestions(allQs);

      } catch (e) {
        console.error('ExamReviewPage load error:', e);
        setError('Failed to load review. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.uid, resultId, archiveId, category, createdAt]);

  const getAiExplain = async (q) => {
    if (aiExplain[q.id]) return;
    setAiLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: `Explain this nursing exam question in 3-4 sentences. Be concise and clinical.\n\nQuestion: ${q.question}\nOptions: ${q.options?.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join(', ')}\nCorrect answer: ${q.options?.[q.correctIndex]}\n${q.explanation ? `Explanation hint: ${q.explanation}` : ''}`,
          }],
        }),
      });
      const data = await res.json();
      setAiExplain(prev => ({ ...prev, [q.id]: data.content?.[0]?.text || 'Could not generate explanation.' }));
    } catch {
      setAiExplain(prev => ({ ...prev, [q.id]: 'AI explanation unavailable.' }));
    } finally { setAiLoading(false); }
  };

  const answers      = session?.answers || {};
  const score        = session?.correct ?? questions.filter(q => answers[q.id] === q.correctIndex).length;
  const total        = session?.totalQuestions ?? questions.length;
  const scorePercent = session?.scorePercent   ?? (total > 0 ? Math.round((score / total) * 100) : 0);
  const scoreColor   = scorePercent >= 70 ? '#16A34A' : scorePercent >= 50 ? '#F59E0B' : '#EF4444';

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      + ' at ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
    <div style={S.center}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Loading your review…</p>
    </div>
  );

  if (error || !session) return (
    <div style={S.center}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Review Unavailable</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{error || 'This session could not be found.'}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
          Reviews are only available for exams where answers were recorded. You can still retake this exam.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate('/daily-practice-archive')}>← Back to Archive</button>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <button onClick={() => navigate('/daily-practice-archive')} style={S.backBtn}>
          ← Back to Archive
        </button>

        {/* Score card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center',
        }}>
          {catInfo && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: `${catInfo.color}18`, border: `1px solid ${catInfo.color}40`,
              borderRadius: 20, padding: '4px 14px', marginBottom: 14,
              fontSize: 13, fontWeight: 700, color: catInfo.color,
            }}>
              {catInfo.icon} {catInfo.shortLabel}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            {session.examName || 'Daily Practice Review'}
          </div>
          <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
            {scorePercent}%
          </div>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
            {score} / {total} correct
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Correct',   value: score,         color: '#16A34A' },
              { label: 'Wrong',     value: total - score, color: '#EF4444' },
              { label: 'Questions', value: total,         color: 'var(--text-muted)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            📅 {formatDate(session.completedAt)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/daily-practice-archive')}>
            📚 Back to Archive
          </button>
          <button className="btn btn-primary" onClick={() => {
            const p = new URLSearchParams({
              category:  session.category || category,
              examType:  'daily_practice',
              count:     String(session.totalQuestions || 20),
              timeLimit: '30',
              shuffle:   'true',
              showExpl:  'false',
              archiveId: archiveId || session.archiveId || '',
              retake:    'true',
            });
            navigate(`/exam/session?${p.toString()}`);
          }}>
            🔁 Retake This Exam
          </button>
        </div>

        {/* Questions */}
        {questions.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Score recorded — question breakdown unavailable
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 340 }}>
              Your score of <strong style={{ color: scoreColor }}>{scorePercent}%</strong> has been saved,
              but individual question details aren't available for this session.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {questions.map((q, i) => {
              const userAns    = answers[q.id];
              const isCorrect  = userAns === q.correctIndex;
              const isAnswered = userAns !== undefined;

              return (
                <div key={q.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 20,
                  borderLeft: `4px solid ${isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B'}`,
                }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B',
                      color: '#fff', fontWeight: 800, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{i + 1}</span>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {q.question}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {q.options?.map((opt, j) => {
                      const isUser       = userAns === j;
                      const isCorrectOpt = q.correctIndex === j;
                      let bg = 'var(--bg-tertiary)', color = 'var(--text-secondary)', border = 'var(--border)';
                      if (isCorrectOpt)            { bg = 'rgba(22,163,74,0.12)';  color = '#16A34A'; border = 'rgba(22,163,74,0.4)'; }
                      if (isUser && !isCorrectOpt) { bg = 'rgba(239,68,68,0.12)'; color = '#EF4444'; border = 'rgba(239,68,68,0.4)'; }
                      return (
                        <div key={j} style={{
                          padding: '10px 14px', borderRadius: 8, fontSize: 14,
                          background: bg, color, border: `1px solid ${border}`,
                          fontWeight: isCorrectOpt || isUser ? 700 : 400,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: isCorrectOpt ? '#16A34A' : isUser ? '#EF4444' : 'var(--bg-card)',
                            color: isCorrectOpt || isUser ? '#fff' : 'var(--text-muted)',
                            fontSize: 11, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid ${border}`,
                          }}>{String.fromCharCode(65 + j)}</span>
                          {typeof opt === 'string' ? opt : opt.text}
                          {isCorrectOpt && <span style={{ marginLeft: 'auto' }}>✓</span>}
                          {isUser && !isCorrectOpt && <span style={{ marginLeft: 'auto' }}>✗</span>}
                        </div>
                      );
                    })}
                  </div>

                  {!isAnswered && (
                    <div style={{
                      fontSize: 12, color: '#64748B', fontWeight: 600, marginBottom: 8,
                      padding: '4px 10px', background: 'rgba(100,116,139,0.08)',
                      borderRadius: 6, display: 'inline-block',
                    }}>⚪ Not answered</div>
                  )}

                  {q.explanation && (
                    <div style={{
                      background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)',
                      borderRadius: 8, padding: '10px 14px', fontSize: 13,
                      color: 'var(--text-secondary)', marginBottom: 8,
                    }}>💡 {q.explanation}</div>
                  )}

                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => getAiExplain(q)}
                    disabled={aiLoading && !aiExplain[q.id]}
                    style={{ fontSize: 12 }}
                  >
                    {aiExplain[q.id] ? '🤖 AI Explanation' : aiLoading ? '⏳ Loading…' : '🤖 Ask AI to Explain'}
                  </button>
                  {aiExplain[q.id] && (
                    <div style={{
                      marginTop: 8, background: 'rgba(124,58,237,0.08)',
                      border: '1px solid rgba(124,58,237,0.2)',
                      borderRadius: 8, padding: '10px 14px',
                      fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                    }}>🤖 {aiExplain[q.id]}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/daily-practice-archive')}>
            ← Back to Archive
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  center: {
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center', alignItems: 'center',
    minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px',
  },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  emptyState: {
    textAlign: 'center', padding: '40px 24px',
    color: 'var(--text-muted)', fontSize: 14,
  },
};