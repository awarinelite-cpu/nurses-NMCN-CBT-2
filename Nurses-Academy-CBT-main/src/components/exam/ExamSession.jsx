// src/components/exam/ExamSession.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection, query, where, getDocs,
  addDoc, serverTimestamp, doc, updateDoc, arrayUnion,
  getDoc, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function ExamSession() {
  const { state }        = useLocation();
  const [searchParams]   = useSearchParams();
  const navigate         = useNavigate();
  const auth = useAuth();
  const currentUser = auth.currentUser || auth.user || null;
  const profile     = auth.profile;

  // ── Params: state (Course Drill) OR URL params (Daily Practice) ──
  const category        = state?.category        || searchParams.get('category');
  const examType        = state?.examType        || searchParams.get('examType');
  const year            = state?.year            || searchParams.get('year');
  const count           = Number(state?.count    || searchParams.get('count')    || 20);
  const doShuffle       = state?.doShuffle       ?? (searchParams.get('shuffle') !== 'false');
  const course          = state?.course          || searchParams.get('course');
  const topic           = state?.topic           || searchParams.get('topic');
  const examId          = state?.examId          || searchParams.get('examId');
  const scheduledExamId = state?.scheduledExamId || searchParams.get('scheduledExamId');
  const examName        = state?.examName        || searchParams.get('examName') || 'Exam';
  const timeLimit       = Number(state?.timeLimit || searchParams.get('timeLimit') || count);

  // ── Daily Practice Archive params ──
  const archiveId  = searchParams.get('archiveId')  || '';
  const createdAt  = searchParams.get('createdAt')  || new Date().toISOString();
  const isRetake   = searchParams.get('retake')     === 'true';

  const catInfo = NURSING_CATEGORIES.find(c => c.id === category);

  // ── State ──
  const [questions,   setQuestions]   = useState([]);
  const [phase,       setPhase]       = useState('loading'); // loading|exam|review|empty|error
  const [current,     setCurrent]     = useState(0);
  const [answers,     setAnswers]     = useState({});
  const [flagged,     setFlagged]     = useState(new Set());
  const [showNav,     setShowNav]     = useState(false);
  const [timeLeft,    setTimeLeft]    = useState(timeLimit * 60);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiExplain,   setAiExplain]   = useState({});
  const [submitted,   setSubmitted]   = useState(false);
  const [bookmarked,  setBookmarked]  = useState(new Set());
  const startedAt = useRef(null);

  // ── Load questions ──
  useEffect(() => {
    const load = async () => {
      try {
        let qs = [];

        if (examType === 'daily_practice' && scheduledExamId) {
          const snap = await getDocs(query(
            collection(db, 'questions'),
            where('scheduledExamId', '==', scheduledExamId),
            where('active', '==', true),
          ));
          qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          if (qs.length === 0) {
            const snap2 = await getDocs(query(
              collection(db, 'questions'),
              where('examId', '==', scheduledExamId),
              where('active', '==', true),
            ));
            qs = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
          }

        } else if (examId && examType !== 'daily_practice') {
          const snap = await getDocs(query(
            collection(db, 'questions'),
            where('examId', '==', examId),
            where('active', '==', true),
          ));
          qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        } else {
          let constraints = [where('active', '==', true)];
          if (examType === 'course_drill') {
            constraints.push(where('examType', '==', 'course_drill'));
            if (course) constraints.push(where('course', '==', course));
          } else if (examType === 'topic_drill') {
            constraints.push(where('examType', '==', 'topic_drill'));
            if (course) constraints.push(where('course', '==', course));
            if (topic)  constraints.push(where('topic',  '==', topic));
          } else {
            constraints.push(where('category', '==', category));
            constraints.push(where('examType', '==', examType));
            if (year) constraints.push(where('year', '==', year));
          }
          const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
          qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        if (doShuffle) qs = qs.sort(() => Math.random() - 0.5);
        qs = qs.slice(0, count);
        setQuestions(qs);
        setPhase(qs.length > 0 ? 'exam' : 'empty');
        startedAt.current = Date.now();
      } catch (e) {
        console.error(e);
        setPhase('error');
      }
    };
    load();
  }, []);

  // ── Timer ──
  useEffect(() => {
    if (phase !== 'exam' || timeLimit === 0) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timer); handleSubmit(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // ── Save to Daily Practice Archive ────────────────────────────────────────
  const saveDailyPracticeArchive = async (scorePercent) => {
    if (!currentUser?.uid || examType !== 'daily_practice' || !archiveId) return;
    try {
      const cat    = NURSING_CATEGORIES.find(c => c.id === category);
      const docRef = doc(db, 'users', currentUser.uid, 'dailyPracticeArchive', archiveId);
      const snap   = await getDoc(docRef);

      if (!snap.exists()) {
        await setDoc(docRef, {
          archiveId,
          category,
          categoryLabel: cat?.shortLabel || category,
          categoryIcon:  cat?.icon       || '⚡',
          examType:      'daily_practice',
          count:         Number(count)     || 20,
          timeLimit:     Number(timeLimit) || 30,
          shuffle:       doShuffle !== false,
          createdAt,
          savedAt:       new Date().toISOString(),
          firstScore:    scorePercent,
          lastScore:     scorePercent,
          attemptCount:  1,
          lastAttemptAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(docRef, {
          lastScore:     scorePercent,
          lastAttemptAt: new Date().toISOString(),
          attemptCount:  (snap.data().attemptCount || 0) + 1,
        });
      }
    } catch (e) {
      console.error('saveDailyPracticeArchive error:', e);
    }
  };

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (submitted) return;

    if (!currentUser?.uid) {
      console.error('Session save error: No authenticated user found.');
      setSubmitted(true);
      setPhase('review');
      return;
    }

    setSubmitted(true);
    setPhase('review');

    const timeTaken    = Math.round((Date.now() - startedAt.current) / 1000);
    const correct      = questions.reduce((a, q) => a + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
    const scorePercent = Math.round((correct / questions.length) * 100);

    const resolvedExamId = scheduledExamId || examId || '';

    try {
      // ── 1. Save to examSessions ──
      await addDoc(collection(db, 'examSessions'), {
        userId:          currentUser.uid,
        examId:          resolvedExamId,
        scheduledExamId: scheduledExamId || '',
        archiveId:       archiveId       || '',
        examName,
        category:        category  || '',
        examType:        examType  || '',
        year:            year      || '',
        course:          course    || '',
        topic:           topic     || '',
        correct,
        totalQuestions:  questions.length,
        scorePercent,
        timeTaken,
        answers,
        questionIds:     questions.map(q => q.id),
        completedAt: serverTimestamp(),
      });

      // ── 2. Mark exam completed in user profile ──
      if (resolvedExamId) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          completedExams: arrayUnion(resolvedExamId),
        });
      }

      // ── 3. Save to Daily Practice Archive ──
      if (examType === 'daily_practice') {
        await saveDailyPracticeArchive(scorePercent);
      }

    } catch (e) { console.error('Session save error:', e); }
  }, [submitted, questions, answers, currentUser, examName,
      examId, scheduledExamId, category, examType, year, course, topic,
      archiveId, createdAt, doShuffle, count, timeLimit]);

  // ── AI Explain ──
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
            content: `Explain this nursing exam question in 3-4 sentences. Be concise and clinical.\n\nQuestion: ${q.question}\nOptions: ${q.options?.map((o,i)=>`${String.fromCharCode(65+i)}. ${o}`).join(', ')}\nCorrect answer: ${q.options?.[q.correctIndex]}\n${q.explanation ? `Explanation hint: ${q.explanation}` : ''}`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || 'Could not generate explanation.';
      setAiExplain(prev => ({ ...prev, [q.id]: text }));
    } catch (e) {
      setAiExplain(prev => ({ ...prev, [q.id]: 'AI explanation unavailable.' }));
    } finally { setAiLoading(false); }
  };

  // ── Bookmark ──
  const toggleBookmark = async (q) => {
    if (!currentUser?.uid) return;
    const isBookmarked = bookmarked.has(q.id);
    try {
      if (isBookmarked) {
        const snap = await getDocs(query(
          collection(db, 'bookmarks'),
          where('userId', '==', currentUser.uid),
          where('questionId', '==', q.id),
        ));
        snap.docs.forEach(d => deleteDoc(doc(db, 'bookmarks', d.id)));
        setBookmarked(prev => { const s = new Set(prev); s.delete(q.id); return s; });
        await updateDoc(doc(db, 'users', currentUser.uid), {
          bookmarkCount: Math.max((profile?.bookmarkCount || 1) - 1, 0),
        });
      } else {
        await addDoc(collection(db, 'bookmarks'), {
          userId:     currentUser.uid,
          questionId: q.id,
          category:   q.category || category,
          createdAt:  serverTimestamp(),
        });
        setBookmarked(prev => new Set(prev).add(q.id));
        await updateDoc(doc(db, 'users', currentUser.uid), {
          bookmarkCount: (profile?.bookmarkCount || 0) + 1,
        });
      }
    } catch (e) { console.error('Bookmark error:', e); }
  };

  // ── Helpers ──
  const answered   = Object.keys(answers).length;
  const unanswered = questions.length - answered;
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const timerColor = timeLeft < 60 ? '#EF4444' : timeLeft < 300 ? '#F59E0B' : 'var(--teal)';
  const score        = questions.reduce((a, q) => a + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
  const scorePercent = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const scoreColor   = scorePercent >= 70 ? '#16A34A' : scorePercent >= 50 ? '#F59E0B' : '#EF4444';

  // ── Phases ──
  if (phase === 'loading') return (
    <div style={S.center}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Loading questions…</p>
    </div>
  );

  if (phase === 'empty') return (
    <div style={S.center}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>No questions found</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>No questions are available for this selection yet.</p>
        <button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    </div>
  );

  if (phase === 'error') return (
    <div style={S.center}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Error loading questions</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Something went wrong. Please try again.</p>
        <button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    </div>
  );

  const q = questions[current];

  // ── REVIEW PHASE ──
  if (phase === 'review') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>

          {/* Score card */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{examName}</div>
            <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
              {scorePercent}%
            </div>
            <div style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
              {score} / {questions.length} correct
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Correct',    value: score,                    color: '#16A34A' },
                { label: 'Wrong',      value: questions.length - score, color: '#EF4444' },
                { label: 'Unanswered', value: unanswered,               color: '#64748B' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {examType === 'daily_practice' && (
              <div style={{
                marginTop: 20, padding: '10px 16px',
                background: 'rgba(13,148,136,0.08)',
                border: '1px solid rgba(13,148,136,0.25)',
                borderRadius: 10, fontSize: 13,
                color: 'var(--teal)', fontWeight: 600,
              }}>
                ✅ Result saved to your Daily Practice Archive
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate(-1)}>← Back</button>
            {examType === 'daily_practice' ? (
              <button className="btn btn-ghost"
                onClick={() => navigate('/daily-practice-archive')}>
                📚 View in Archive
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => {
                setAnswers({}); setFlagged(new Set()); setCurrent(0);
                setSubmitted(false); setPhase('loading');
                setTimeout(() => setPhase('exam'), 100);
              }}>🔄 Retake</button>
            )}
          </div>

          {/* Questions review */}
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
                      if (isCorrectOpt)           { bg = 'rgba(22,163,74,0.12)';  color = '#16A34A'; border = 'rgba(22,163,74,0.4)'; }
                      if (isUser && !isCorrectOpt){ bg = 'rgba(239,68,68,0.12)'; color = '#EF4444'; border = 'rgba(239,68,68,0.4)'; }

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

                  {q.explanation && (
                    <div style={{
                      background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)',
                      borderRadius: 8, padding: '10px 14px', fontSize: 13,
                      color: 'var(--text-secondary)', marginBottom: 8,
                    }}>
                      💡 {q.explanation}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => getAiExplain(q)}
                      disabled={aiLoading && !aiExplain[q.id]}
                      style={{ fontSize: 12 }}
                    >
                      {aiExplain[q.id] ? '🤖 AI Explanation' : aiLoading ? '⏳ Loading…' : '🤖 Ask AI to Explain'}
                    </button>
                    <button
                      onClick={() => toggleBookmark(q)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 18, opacity: bookmarked.has(q.id) ? 1 : 0.4,
                        color: bookmarked.has(q.id) ? '#F59E0B' : 'inherit',
                      }}
                      title={bookmarked.has(q.id) ? 'Remove bookmark' : 'Bookmark this question'}
                    >🔖</button>
                  </div>
                  {aiExplain[q.id] && (
                    <div style={{
                      marginTop: 8, background: 'rgba(124,58,237,0.08)',
                      border: '1px solid rgba(124,58,237,0.2)',
                      borderRadius: 8, padding: '10px 14px',
                      fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                    }}>
                      🤖 {aiExplain[q.id]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── EXAM PHASE ──
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* Top header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {examName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Q{current + 1} of {questions.length} · {answered} answered
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {timeLimit > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontWeight: 800, fontSize: 22, color: timerColor,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ fontSize: 16 }}>⏱</span>
                  {mins}:{secs}
                </div>
              )}
              <button className="btn btn-danger btn-sm" onClick={() => {
                if (window.confirm('Submit exam now?')) handleSubmit();
              }}>
                Submit
              </button>
            </div>
          </div>

          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'var(--teal)',
              width: `${(answered / questions.length) * 100}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px' }}>

        <button
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 12 }}
          onClick={() => setShowNav(v => !v)}
        >
          {showNav ? '▲ Hide' : '▼ Show'} Question Navigator
        </button>

        {showNav && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {questions.map((q, i) => {
                const isAnswered = answers[q.id] !== undefined;
                const isFlagged  = flagged.has(q.id);
                const isCurrent  = i === current;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrent(i)}
                    style={{
                      width: 36, height: 36, borderRadius: 8, border: '2px solid',
                      cursor: 'pointer', fontWeight: 700, fontSize: 12,
                      fontFamily: 'inherit',
                      borderColor: isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--border)',
                      background:  isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B18' : isAnswered ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
                      color:       isCurrent ? '#fff' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--text-muted)',
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { color: '#16A34A', label: `Answered (${answered})` },
                { color: '#F59E0B', label: `Flagged (${flagged.size})` },
                { color: 'var(--text-muted)', label: `Unanswered (${unanswered})` },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                  <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {q && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 24, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {examType && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(13,148,136,0.12)', color: 'var(--teal)',
                  border: '1px solid rgba(13,148,136,0.3)',
                }}>{examType.replace(/_/g, ' ')}</span>
              )}
              {q.difficulty && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: q.difficulty === 'hard' ? 'rgba(239,68,68,0.1)' : q.difficulty === 'easy' ? 'rgba(22,163,74,0.1)' : 'rgba(245,158,11,0.1)',
                  color: q.difficulty === 'hard' ? '#EF4444' : q.difficulty === 'easy' ? '#16A34A' : '#F59E0B',
                  border: `1px solid ${q.difficulty === 'hard' ? 'rgba(239,68,68,0.3)' : q.difficulty === 'easy' ? 'rgba(22,163,74,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}>{q.difficulty}</span>
              )}
              <button
                onClick={() => setFlagged(prev => {
                  const s = new Set(prev);
                  s.has(q.id) ? s.delete(q.id) : s.add(q.id);
                  return s;
                })}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 18, opacity: flagged.has(q.id) ? 1 : 0.4,
                }}
                title="Flag for review"
              >🚩</button>
              <button
                onClick={() => toggleBookmark(q)}
                style={{
                  background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 18,
                  opacity: bookmarked.has(q.id) ? 1 : 0.4,
                  color: bookmarked.has(q.id) ? '#F59E0B' : 'inherit',
                }}
                title={bookmarked.has(q.id) ? 'Remove bookmark' : 'Bookmark this question'}
              >🔖</button>
            </div>

            <p style={{
              fontSize: 17, fontWeight: 600, lineHeight: 1.65,
              color: 'var(--text-primary)', margin: '0 0 20px',
            }}>
              {q.question}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.options?.map((opt, i) => {
                const selected = answers[q.id] === i;
                return (
                  <button
                    key={i}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: i }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 15, textAlign: 'left',
                      border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
                      background: selected ? 'rgba(13,148,136,0.1)' : 'var(--bg-tertiary)',
                      color: selected ? 'var(--teal)' : 'var(--text-primary)',
                      fontWeight: selected ? 700 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: selected ? 'var(--teal)' : 'var(--bg-card)',
                      color: selected ? '#fff' : 'var(--text-muted)',
                      fontWeight: 800, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
                    }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {typeof opt === 'string' ? opt : opt.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-ghost"
            disabled={current === 0}
            onClick={() => setCurrent(c => c - 1)}
          >← Previous</button>

          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {current + 1} / {questions.length}
          </span>

          {current < questions.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setCurrent(c => c + 1)}>
              Next →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => {
              if (window.confirm(`Submit exam? ${unanswered > 0 ? `You have ${unanswered} unanswered question(s).` : 'All questions answered.'}`)) {
                handleSubmit();
              }
            }}>
              ✅ Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  center: {
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center', alignItems: 'center',
    minHeight: '100vh', background: 'var(--bg-primary)',
  },
};