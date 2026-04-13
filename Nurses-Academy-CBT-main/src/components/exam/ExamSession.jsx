// src/components/exam/ExamSession.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs,
  addDoc, serverTimestamp, doc, updateDoc, arrayUnion,
  deleteDoc, getDoc, increment,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

// ─── Constants ────────────────────────────────────────────────────────────────
const DAILY_PRACTICE_LIMIT = 250;

export default function ExamSession() {
  const { state }   = useLocation();
  const navigate    = useNavigate();
  const auth        = useAuth();
  const currentUser = auth.currentUser || auth.user || null;
  const profile     = auth.profile;

  // ── Decode navigation state ─────────────────────────────────────────────────
  const examId      = state?.examId      || '';
  const examName    = state?.examName    || 'Exam';
  const examType    = state?.examType    || 'daily_practice';
  const category    = state?.category   || '';
  const course      = state?.course     || '';
  const courseLabel = state?.courseLabel || '';
  const topic       = state?.topic      || '';
  const count       = Number(state?.count     || 20);
  const timeLimit   = Number(state?.timeLimit || 0);
  const doShuffle   = state?.doShuffle  !== false;
  const reviewMode  = state?.reviewMode || false;

  // poolMode = true  → load directly from questions collection by tag filters
  // poolMode = false → legacy path: load by examId (scheduled exams, past questions)
  const poolMode    = state?.poolMode   || false;

  const [questions,  setQuestions]  = useState([]);
  const [phase,      setPhase]      = useState('loading');
  const [current,    setCurrent]    = useState(0);
  const [answers,    setAnswers]    = useState({});
  const [flagged,    setFlagged]    = useState(new Set());
  const [showNav,    setShowNav]    = useState(false);
  const [timeLeft,   setTimeLeft]   = useState(timeLimit * 60);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiExplain,  setAiExplain]  = useState({});
  const [submitted,  setSubmitted]  = useState(false);
  const [bookmarked, setBookmarked] = useState(new Set());
  const [reportedQs, setReportedQs] = useState(new Set());
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(null);
  const startedAt = useRef(null);

  // ── Load questions ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        let qs = [];

        if (poolMode) {
          // ── UNIFIED POOL MODE ────────────────────────────────────────────────
          // All 3 drill types pull from the shared questions collection.
          // The only difference is the filter applied.

          const baseConstraints = [where('active', '==', true)];

          if (examType === 'topic_drill' && topic) {
            // Topic Drill → exact topic match
            baseConstraints.push(where('topic', '==', topic));
          } else if (examType === 'course_drill' && course) {
            // Course Drill → all topics under this course
            baseConstraints.push(where('course', '==', course));
          }
          // Daily Practice → no extra filter (all active questions)

          const snap = await getDocs(query(collection(db, 'questions'), ...baseConstraints));
          qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          // Seen-questions deduplication
          const seenIds = profile?.seenQuestions || [];
          const unseen  = qs.filter(q => !seenIds.includes(q.id));

          // Use unseen pool if it has enough questions; else reset (all questions)
          const minViable = examType === 'daily_practice' ? 10 : 5;
          const pool = unseen.length >= minViable ? unseen : qs;

          // Always shuffle for pool mode
          pool.sort(() => Math.random() - 0.5);

          // Cap daily practice at 250; drills use all available
          const cap = examType === 'daily_practice' ? DAILY_PRACTICE_LIMIT : pool.length;
          qs = pool.slice(0, cap);

        } else {
          // ── LEGACY EXAM-ID MODE (scheduled exams, past questions) ───────────
          if (examId) {
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('examId', '==', examId),
              where('active', '==', true),
            ));
            qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }

          // Fallback for legacy questions tagged by examType+category only
          if (qs.length === 0 && examType && category) {
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('examType', '==', examType),
              where('category', '==', category),
              where('active',   '==', true),
            ));
            qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }

          // Seen-questions deduplication for legacy mode
          const seenIds = profile?.seenQuestions || [];
          const unseen  = qs.filter(q => !seenIds.includes(q.id));
          const pool = unseen.length >= Math.min(count, 5) ? unseen : qs;

          if (doShuffle) pool.sort(() => Math.random() - 0.5);
          qs = pool.slice(0, count);
        }

        setQuestions(qs);
        setPhase(reviewMode ? 'review' : qs.length > 0 ? 'exam' : 'empty');
        startedAt.current = Date.now();
      } catch (e) {
        console.error('ExamSession load error:', e);
        setPhase('error');
      }
    };
    load();
  }, []);

  // ── Timer ───────────────────────────────────────────────────────────────────
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

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitted) return;
    setSubmitted(true);
    setPhase('review');

    if (!currentUser?.uid) return;

    const timeTaken    = Math.round((Date.now() - startedAt.current) / 1000);
    const correct      = questions.reduce((a, q) => a + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
    const scorePercent = Math.round((correct / questions.length) * 100);
    const questionIds  = questions.map(q => q.id);

    // Build a human-readable session name for pool-mode sessions
    const sessionName = poolMode
      ? examType === 'daily_practice'
        ? `Daily Practice — ${new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`
        : examType === 'course_drill'
          ? `${courseLabel || course} — Course Drill`
          : `${topic} — Topic Drill`
      : examName;

    try {
      // Save exam session
      await addDoc(collection(db, 'examSessions'), {
        userId:         currentUser.uid,
        examId:         examId || null,
        examName:       sessionName,
        category:       category  || '',
        examType:       examType  || '',
        course:         course    || '',
        courseLabel:    courseLabel || '',
        topic:          topic     || '',
        poolMode:       poolMode,
        correct,
        totalQuestions: questions.length,
        scorePercent,
        timeTaken,
        answers,
        questionIds,
        completedAt:    serverTimestamp(),
      });

      // Update user profile stats + mark questions as seen
      const today = new Date().toDateString();
      const lastPractice = profile?.lastPracticeDate;
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const newStreak = lastPractice === yesterday ? (profile?.streak || 0) + 1
                      : lastPractice === today    ? (profile?.streak || 0)
                      : 1;

      await updateDoc(doc(db, 'users', currentUser.uid), {
        completedExams:         arrayUnion(examId || sessionName),
        seenQuestions:          arrayUnion(...questionIds),
        totalExams:             increment(1),
        totalScore:             increment(scorePercent),
        totalQuestionsAnswered: increment(questions.length),
        bestScore:              Math.max(profile?.bestScore || 0, scorePercent),
        streak:                 newStreak,
        lastPracticeDate:       today,
        [`examScores.${examId || 'pool'}`]: scorePercent,
      }).catch(() => {});

    } catch (e) {
      console.error('Session save error:', e);
    }
  }, [submitted, questions, answers, currentUser, examId, examName,
      category, examType, course, courseLabel, topic, profile, poolMode]);

  // ── AI Explain ──────────────────────────────────────────────────────────────
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
      setAiExplain(prev => ({ ...prev, [q.id]: data.content?.[0]?.text || 'Could not generate explanation.' }));
    } catch {
      setAiExplain(prev => ({ ...prev, [q.id]: 'AI explanation unavailable.' }));
    } finally { setAiLoading(false); }
  };

  // ── Bookmark ────────────────────────────────────────────────────────────────
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
        }).catch(() => {});
      } else {
        await addDoc(collection(db, 'bookmarks'), {
          userId:     currentUser.uid,
          questionId: q.id,
          category:   q.category || category,
          createdAt:  serverTimestamp(),
        });
        setBookmarked(prev => new Set(prev).add(q.id));
        await updateDoc(doc(db, 'users', currentUser.uid), {
          bookmarkCount: increment(1),
        }).catch(() => {});
      }
    } catch (e) { console.error('Bookmark error:', e); }
  };

  // ── Report question ─────────────────────────────────────────────────────────
  const submitReport = async (q) => {
    if (!reportText.trim() || !currentUser?.uid) return;
    try {
      await addDoc(collection(db, 'questionReports'), {
        questionId: q.id,
        question:   q.question,
        userId:     currentUser.uid,
        report:     reportText.trim(),
        createdAt:  serverTimestamp(),
        status:     'pending',
      });
      setReportedQs(prev => new Set(prev).add(q.id));
      setShowReport(null);
      setReportText('');
    } catch (e) { console.error('Report error:', e); }
  };

  // ── Retake ──────────────────────────────────────────────────────────────────
  const handleRetake = () => {
    setAnswers({});
    setFlagged(new Set());
    setCurrent(0);
    setSubmitted(false);
    setAiExplain({});
    setPhase('loading');

    const load = async () => {
      try {
        let qs = [];

        if (poolMode) {
          // Re-query the pool (will now exclude the questions just completed
          // since they've been added to seenQuestions in Firestore).
          // We read from the refreshed profile via auth — but since profile
          // may not have re-fetched, we use the local questions list as extra
          // seen IDs to avoid immediate repeats.
          const justSeen = questions.map(q => q.id);
          const baseConstraints = [where('active', '==', true)];
          if (examType === 'topic_drill' && topic) baseConstraints.push(where('topic', '==', topic));
          else if (examType === 'course_drill' && course) baseConstraints.push(where('course', '==', course));

          const snap = await getDocs(query(collection(db, 'questions'), ...baseConstraints));
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          const seenIds = [...(profile?.seenQuestions || []), ...justSeen];
          const unseen  = all.filter(q => !seenIds.includes(q.id));
          const minViable = examType === 'daily_practice' ? 10 : 5;
          const pool = unseen.length >= minViable ? unseen : all;

          pool.sort(() => Math.random() - 0.5);
          const cap = examType === 'daily_practice' ? DAILY_PRACTICE_LIMIT : pool.length;
          qs = pool.slice(0, cap);
        } else {
          const snap = await getDocs(query(
            collection(db, 'questions'),
            where('examId', '==', examId),
            where('active', '==', true),
          ));
          qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (doShuffle) qs.sort(() => Math.random() - 0.5);
          qs = qs.slice(0, count);
        }

        setQuestions(qs);
        setTimeLeft(timeLimit * 60);
        setPhase(qs.length > 0 ? 'exam' : 'empty');
        startedAt.current = Date.now();
      } catch { setPhase('error'); }
    };
    load();
  };

  const answered   = Object.keys(answers).length;
  const unanswered = questions.length - answered;
  const mins       = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs       = String(timeLeft % 60).padStart(2, '0');
  const timerColor = timeLeft < 60 ? '#EF4444' : timeLeft < 300 ? '#F59E0B' : 'var(--teal)';
  const score      = questions.reduce((a, q) => a + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
  const scorePct   = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const scoreColor = scorePct >= 70 ? '#16A34A' : scorePct >= 50 ? '#F59E0B' : '#EF4444';

  // ── Phase renders ───────────────────────────────────────────────────────────
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
        <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
          {poolMode
            ? examType === 'topic_drill'
              ? `No questions have been uploaded for topic "${topic}" yet.`
              : examType === 'course_drill'
                ? `No questions have been uploaded for this course yet.`
                : `No questions are available in the question pool yet.`
            : 'No questions are available for this exam yet.'
          }
        </p>
        <button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    </div>
  );

  if (phase === 'error') return (
    <div style={S.center}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h3>Error loading questions</h3>
        <button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    </div>
  );

  const q = questions[current];

  // ══════════════════════════════════════════════════════════════════════════
  // REVIEW PHASE
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'review') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>

          {/* Score card */}
          {!reviewMode && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center',
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                {poolMode
                  ? examType === 'daily_practice' ? '⚡ Daily Practice'
                  : examType === 'course_drill'   ? `📖 Course Drill — ${courseLabel || course}`
                  : `🎯 Topic Drill — ${topic}`
                  : examName
                }
              </div>
              <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{scorePct}%</div>
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
            </div>
          )}

          {/* Action buttons */}
          <div style={{
            display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap',
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg-primary)', paddingBottom: 12, paddingTop: 4,
          }}>
            <button className="btn btn-ghost" onClick={() => navigate(poolMode ? -1 : -2)} style={{ flex: '1 1 100px' }}>🏠 Back Home</button>
            {!reviewMode && <button className="btn btn-primary" onClick={handleRetake} style={{ flex: '1 1 100px' }}>🔄 Retake</button>}
            {reviewMode && <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ flex: '1 1 100px' }}>← Back</button>}
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
                  borderLeft: `4px solid ${reviewMode ? 'var(--teal)' : isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B'}`,
                }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: reviewMode ? 'var(--teal)' : isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B',
                      color: '#fff', fontWeight: 800, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{i + 1}</span>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.5, flex: 1 }}>
                      {q.question}
                    </p>
                    {/* Tags: topic + course visible in review */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
                      {q.topic  && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(13,148,136,0.1)', color: 'var(--teal)', fontWeight: 700 }}>📌 {q.topic}</span>}
                      {q.course && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>{q.course}</span>}
                    </div>
                  </div>

                  {q.imageUrl && (
                    <div style={{ marginBottom: 12, textAlign: 'center' }}>
                      <img src={q.imageUrl} alt="Question" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1px solid var(--border)', objectFit: 'contain' }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {q.options?.map((opt, j) => {
                      const isUser       = !reviewMode && userAns === j;
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

                  {/* Explanation from upload */}
                  {q.explanation && (
                    <div style={{
                      background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)',
                      borderRadius: 8, padding: '10px 14px', fontSize: 13,
                      color: 'var(--text-secondary)', marginBottom: 8,
                    }}>
                      <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 4, fontSize: 12 }}>
                        💡 Explanation
                      </div>
                      {q.explanation}
                      {q.explanationImageUrl && (
                        <div style={{ marginTop: 10, textAlign: 'center' }}>
                          <img src={q.explanationImageUrl} alt="Explanation" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, border: '1px solid rgba(13,148,136,0.3)', objectFit: 'contain' }} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    {/* AI Explain */}
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => getAiExplain(q)}
                      disabled={aiLoading && !aiExplain[q.id]}
                      style={{ fontSize: 12 }}>
                      {aiExplain[q.id] ? '🤖 AI Explained' : aiLoading ? '⏳ Loading…' : '🤖 Ask AI to Explain'}
                    </button>

                    {/* Bookmark — clearly labeled */}
                    <button
                      onClick={() => toggleBookmark(q)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${bookmarked.has(q.id) ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`,
                        background: bookmarked.has(q.id) ? 'rgba(245,158,11,0.12)' : 'transparent',
                        color: bookmarked.has(q.id) ? '#F59E0B' : 'var(--text-muted)',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      🔖 {bookmarked.has(q.id) ? 'Bookmarked ✓' : 'Bookmark this Question'}
                    </button>

                    {/* Report */}
                    {!reportedQs.has(q.id) && (
                      <button
                        onClick={() => setShowReport(showReport === q.id ? null : q.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '5px 8px' }}
                      >
                        🚩 Report
                      </button>
                    )}
                    {reportedQs.has(q.id) && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>✓ Reported</span>
                    )}
                  </div>

                  {/* AI explanation result */}
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

                  {/* Report input */}
                  {showReport === q.id && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <input
                        value={reportText}
                        onChange={e => setReportText(e.target.value)}
                        placeholder="Describe the issue (wrong answer, typo, etc.)"
                        style={{
                          flex: 1, padding: '8px 12px', background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)', borderRadius: 8,
                          color: 'var(--text-primary)', fontSize: 13,
                        }}
                      />
                      <button className="btn btn-sm" onClick={() => submitReport(q)}
                        style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        Submit
                      </button>
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

  // ══════════════════════════════════════════════════════════════════════════
  // EXAM PHASE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {poolMode
                  ? examType === 'daily_practice' ? '⚡ Daily Practice'
                  : examType === 'course_drill'   ? `📖 ${courseLabel || 'Course Drill'}`
                  : `🎯 ${topic || 'Topic Drill'}`
                  : examName
                }
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Q{current + 1} of {questions.length} · {answered} answered</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {timeLimit > 0 && (
                <div style={{ fontWeight: 800, fontSize: 22, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
                  ⏱ {mins}:{secs}
                </div>
              )}
              <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm('Submit exam now?')) handleSubmit(); }}>Submit</button>
            </div>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'var(--teal)', width: `${(answered / questions.length) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px' }}>

        {/* Question navigator */}
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setShowNav(v => !v)}>
          {showNav ? '▲ Hide' : '▼ Show'} Question Navigator
        </button>

        {showNav && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {questions.map((q, i) => {
                const isAnswered = answers[q.id] !== undefined;
                const isFlagged  = flagged.has(q.id);
                const isCurrent  = i === current;
                return (
                  <button key={q.id} onClick={() => setCurrent(i)} style={{
                    width: 36, height: 36, borderRadius: 8, border: '2px solid',
                    cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
                    borderColor: isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--border)',
                    background:  isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B18' : isAnswered ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
                    color:       isCurrent ? '#fff' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--text-muted)',
                  }}>{i + 1}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Question card */}
        {q && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {examType && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(13,148,136,0.12)', color: 'var(--teal)', border: '1px solid rgba(13,148,136,0.3)' }}>
                  {examType.replace(/_/g, ' ')}
                </span>
              )}
              {q.topic  && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📌 {q.topic}</span>}
              {q.course && poolMode && examType === 'daily_practice' && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>· {q.course}</span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {/* Flag */}
                <button onClick={() => setFlagged(prev => { const s = new Set(prev); s.has(q.id) ? s.delete(q.id) : s.add(q.id); return s; })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: flagged.has(q.id) ? 1 : 0.35 }}
                  title="Flag for review">🚩</button>
                {/* Bookmark — clearly labeled */}
                <button onClick={() => toggleBookmark(q)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: bookmarked.has(q.id) ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${bookmarked.has(q.id) ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
                    color: bookmarked.has(q.id) ? '#F59E0B' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 700,
                  }}
                  title={bookmarked.has(q.id) ? 'Remove bookmark' : 'Bookmark this question'}
                >
                  🔖 {bookmarked.has(q.id) ? 'Bookmarked' : 'Bookmark'}
                </button>
              </div>
            </div>

            <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.65, color: 'var(--text-primary)', margin: '0 0 20px' }}>
              {q.question}
            </p>

            {q.imageUrl && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <img src={q.imageUrl} alt="Question diagram" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 10, border: '1px solid var(--border)', objectFit: 'contain' }} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.options?.map((opt, i) => {
                const selected = answers[q.id] === i;
                return (
                  <button key={i} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: i }))} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 15, textAlign: 'left',
                    border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
                    background: selected ? 'rgba(13,148,136,0.1)' : 'var(--bg-tertiary)',
                    color: selected ? 'var(--teal)' : 'var(--text-primary)',
                    fontWeight: selected ? 700 : 400, transition: 'all 0.15s',
                  }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: selected ? 'var(--teal)' : 'var(--bg-card)',
                      color: selected ? '#fff' : 'var(--text-muted)',
                      fontWeight: 800, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
                    }}>{String.fromCharCode(65 + i)}</span>
                    {typeof opt === 'string' ? opt : opt.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost" disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>← Previous</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{current + 1} / {questions.length}</span>
          {current < questions.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setCurrent(c => c + 1)}>Next →</button>
          ) : (
            <button className="btn btn-primary" onClick={() => {
              if (window.confirm(`Submit exam? ${unanswered > 0 ? `You have ${unanswered} unanswered question(s).` : 'All questions answered.'}`)) {
                handleSubmit();
              }
            }}>✅ Finish</button>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  center: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-primary)' },
};
