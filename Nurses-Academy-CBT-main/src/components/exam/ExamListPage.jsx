// src/components/exam/ExamListPage.jsx
//
// Shared exam list used by Daily Practice, Course Drill, and Topic Drill.
//
// Props (passed via router state):
//   examType    — 'daily_practice' | 'course_drill' | 'topic_drill'
//   category    — category id
//   course      — course id (course_drill / topic_drill only)
//   courseLabel — course label string
//   topic       — topic string (topic_drill only)
//
// Each card shows the exam name, date uploaded, question count,
// student's attempt count + last score. Clicking expands to show
// Take and Review buttons.

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function ExamListPage() {
  const navigate        = useNavigate();
  const { state }       = useLocation();
  const { user }        = useAuth();

  const examType    = state?.examType    || 'daily_practice';
  const category    = state?.category    || '';
  const course      = state?.course      || '';
  const courseLabel = state?.courseLabel || '';
  const topic       = state?.topic       || '';

  const catInfo = NURSING_CATEGORIES.find(c => c.id === category);

  const [exams,     setExams]     = useState([]);
  const [sessions,  setSessions]  = useState([]); // user's past sessions
  const [loading,   setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  // ── Load exams ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Build exam query — NO orderBy (avoids composite index requirement)
        let constraints = [
          where('examType', '==', examType),
          where('active',   '==', true),
        ];

        if (examType === 'daily_practice') {
          constraints.push(where('category', '==', category));
        } else if (examType === 'course_drill') {
          constraints.push(where('course', '==', course));
        } else if (examType === 'topic_drill') {
          constraints.push(where('course', '==', course));
          constraints.push(where('topic',  '==', topic));
        }

        const examSnap = await getDocs(query(collection(db, 'exams'), ...constraints));
        let fetchedExams = examSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Bug fix: hide exams whose questions have all been deleted
        fetchedExams = fetchedExams.filter(e => (e.totalQuestions || 0) > 0);

        // Sort newest first in JS — no composite index needed
        fetchedExams.sort((a, b) => {
          const at = a.createdAt?.toDate?.() || new Date(0);
          const bt = b.createdAt?.toDate?.() || new Date(0);
          return bt - at;
        });

        setExams(fetchedExams);

        // Load user's past sessions for these exams
        if (user?.uid) {
          let sConstraints = [
            where('userId',   '==', user.uid),
            where('examType', '==', examType),
          ];
          if (examType === 'daily_practice') {
            sConstraints.push(where('category', '==', category));
          } else if (examType === 'course_drill') {
            sConstraints.push(where('course', '==', course));
          } else if (examType === 'topic_drill') {
            sConstraints.push(where('course', '==', course));
            sConstraints.push(where('topic',  '==', topic));
          }
          const sessionSnap = await getDocs(query(collection(db, 'examSessions'), ...sConstraints));
          setSessions(sessionSnap.docs.map(d => d.data()));
        }
      } catch (e) {
        console.error('ExamListPage load error:', e);
        setExams([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [examType, category, course, topic, user?.uid]);

  // ── Per-exam attempt stats ─────────────────────────────────────────────────
  const statsForExam = (examId) => {
    const examSessions = sessions.filter(s => s.examId === examId);
    if (examSessions.length === 0) return null;
    const best = Math.max(...examSessions.map(s => s.scorePercent || 0));
    const last = examSessions.sort((a, b) => {
      const at = a.completedAt?.toDate?.() || new Date(0);
      const bt = b.completedAt?.toDate?.() || new Date(0);
      return bt - at;
    })[0];
    return {
      attempts:  examSessions.length,
      bestScore: best,
      lastScore: last?.scorePercent || 0,
      lastDate:  last?.completedAt?.toDate?.()?.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) || '',
    };
  };

  const scoreColor = (pct) =>
    pct >= 70 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#EF4444';

  // ── Format exam date ───────────────────────────────────────────────────────
  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Navigate to exam setup (Take) or directly to session (Review) ──────────
  const goToExam = (exam, reviewMode = false) => {
    if (reviewMode) {
      // Skip setup page — go straight to review in ExamSession
      navigate('/exam/session', {
        state: {
          examId:         exam.id,
          examName:       exam.name,
          examType,
          category,
          course,
          courseLabel,
          topic,
          count:          exam.totalQuestions || 40,
          timeLimit:      0,
          doShuffle:      false,
          showExpl:       true,
          reviewMode:     true,
        },
      });
    } else {
      navigate('/exam/setup', {
        state: {
          examId:         exam.id,
          examName:       exam.name,
          examType,
          category,
          course,
          courseLabel,
          topic,
          totalQuestions: exam.totalQuestions || 0,
          reviewMode:     false,
        },
      });
    }
  };

  // ── Breadcrumb label ───────────────────────────────────────────────────────
  const breadcrumb = () => {
    if (examType === 'daily_practice') return catInfo?.shortLabel || category;
    if (examType === 'course_drill')   return `${catInfo?.shortLabel} › ${courseLabel}`;
    return `${catInfo?.shortLabel} › ${courseLabel} › ${topic}`;
  };

  const typeLabel = {
    daily_practice: '⚡ Daily Practice',
    course_drill:   '📖 Course Drill',
    topic_drill:    '🎯 Topic Drill',
  }[examType] || 'Exams';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto' }}>

      {/* Back */}
      <button onClick={() => navigate(-1)} style={styles.backBtn}>
        ← Back
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>{catInfo?.icon || '📋'}</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {typeLabel}
            </div>
            <h2 style={{ margin: 0, fontFamily: "'Playfair Display',serif", fontSize: '1.3rem', color: 'var(--text-primary)' }}>
              {breadcrumb()}
            </h2>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          {loading ? 'Loading exams…' : `${exams.length} exam${exams.length !== 1 ? 's' : ''} available`}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <span className="spinner" />
        </div>
      )}

      {/* Empty */}
      {!loading && exams.length === 0 && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--text-primary)' }}>
            No exams uploaded yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            The admin hasn't uploaded any exams for this selection yet.
          </div>
        </div>
      )}

      {/* Exam list */}
      {!loading && exams.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {exams.map((exam, idx) => {
            const stats      = statsForExam(exam.id);
            const isExpanded = expandedId === exam.id;

            return (
              <div
                key={exam.id}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${isExpanded ? 'var(--teal)' : 'var(--border)'}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Card header — always visible, click to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : exam.id)}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '16px', textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Index badge */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: isExpanded ? 'var(--teal)' : 'rgba(13,148,136,0.12)',
                      color: isExpanded ? '#fff' : 'var(--teal)',
                      fontWeight: 800, fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {idx + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Exam name */}
                      <div style={{
                        fontWeight: 700, fontSize: 14,
                        color: 'var(--text-primary)', marginBottom: 4,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {exam.name}
                      </div>

                      {/* Meta row */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          📅 {fmtDate(exam.createdAt)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>
                          ❓ {exam.totalQuestions || 0} questions
                        </span>
                        {exam.difficulty && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                            background: exam.difficulty === 'hard' ? 'rgba(239,68,68,0.1)'
                              : exam.difficulty === 'easy' ? 'rgba(22,163,74,0.1)'
                              : 'rgba(245,158,11,0.1)',
                            color: exam.difficulty === 'hard' ? '#EF4444'
                              : exam.difficulty === 'easy' ? '#16A34A' : '#F59E0B',
                          }}>
                            {exam.difficulty}
                          </span>
                        )}
                      </div>

                      {/* Attempt stats */}
                      {stats ? (
                        <div style={{
                          display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap',
                        }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            🔁 {stats.attempts} attempt{stats.attempts !== 1 ? 's' : ''}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(stats.bestScore) }}>
                            🏆 Best: {stats.bestScore}%
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Last: {stats.lastScore}% · {stats.lastDate}
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                          Not attempted yet
                        </div>
                      )}
                    </div>

                    {/* Expand chevron */}
                    <div style={{
                      color: 'var(--teal)', fontSize: 16, fontWeight: 900, flexShrink: 0,
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                    }}>›</div>
                  </div>
                </button>

                {/* Expanded action buttons */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: '14px 16px',
                    display: 'flex', gap: 10, flexWrap: 'wrap',
                    background: 'rgba(13,148,136,0.04)',
                  }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => goToExam(exam, false)}
                      style={{ flex: '1 1 120px', fontSize: 14 }}
                    >
                      🚀 Take Exam
                    </button>
                    {stats && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => goToExam(exam, true)}
                        style={{ flex: '1 1 120px', fontSize: 14 }}
                      >
                        👁️ Review
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  emptyState: {
    textAlign: 'center', padding: '60px 24px',
    color: 'var(--text-muted)', fontSize: 14,
  },
};
