// src/components/exam/CourseDrillArchivePage.jsx
// Route: /course-drill-archive
//
// FLOW (mirrors DailyPracticeArchivePage exactly):
//   Step 1 — Choose a Nursing Specialty (grid, shows only specialties with attempts)
//   Step 2 — Choose a Course (grid of courses with attempt counts)
//   Step 3 — List of all past attempts for that course
//
// Reads from 'examSessions' collection where:
//   userId == current user AND examType == 'course_drill'
//
// NOTE: This page is ARCHIVE-ONLY. The take-exam flow is CourseDrillPage (/course-drill).

import { useState, useEffect } from 'react';
import { useNavigate }          from 'react-router-dom';
import {
  collection, getDocs, query, where, orderBy,
} from 'firebase/firestore';
import { db }                   from '../../firebase/config';
import { useAuth }              from '../../context/AuthContext';
import { DEFAULT_NURSING_COURSES, NURSING_CATEGORIES } from '../../data/categories';

// Same map used in CourseDrillPage so courses always resolve to a specialty
const COURSE_CATEGORY_MAP = {
  anatomy:             'all',
  physiology:          'all',
  medical_surgical:    'general_nursing',
  pharmacology:        'all',
  fundamentals:        'general_nursing',
  maternal_child:      'midwifery',
  community_health:    'public_health',
  psychiatric_nursing: 'mental_health',
  nutrition:           'all',
  microbiology:        'all',
};

export default function CourseDrillArchivePage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [step,      setStep]      = useState(1);
  const [specialty, setSpecialty] = useState(null);
  const [course,    setCourse]    = useState(null);
  const [sessions,  setSessions]  = useState([]);  // all user's course_drill attempts
  const [allCourses, setAllCourses] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  // Load courses (same merge as CourseDrillPage)
  useEffect(() => {
    const load = async () => {
      try {
        const snap   = await getDocs(collection(db, 'courses'));
        const custom = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const merged = [...DEFAULT_NURSING_COURSES];
        custom.forEach(c => { if (!merged.find(m => m.id === c.id)) merged.push(c); });
        setAllCourses(merged);
      } catch {
        setAllCourses(DEFAULT_NURSING_COURSES);
      }
    };
    load();
  }, []);

  // Load all this user's course_drill sessions from examSessions
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId',   '==', user.uid),
          where('examType', '==', 'course_drill'),
          orderBy('completedAt', 'desc'),
        ));
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('CourseDrillArchivePage load error:', e);
        // Try without orderBy if composite index not yet created
        try {
          const snap2 = await getDocs(query(
            collection(db, 'examSessions'),
            where('userId',   '==', user.uid),
            where('examType', '==', 'course_drill'),
          ));
          const sorted = snap2.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const ta = a.completedAt?.toDate?.()?.getTime?.() || 0;
              const tb = b.completedAt?.toDate?.()?.getTime?.() || 0;
              return tb - ta;
            });
          setSessions(sorted);
        } catch (e2) {
          console.error('CourseDrillArchivePage fallback error:', e2);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // Helper: resolve a course to its specialty id
  const courseSpecialtyId = (c) => {
    if (c.category) return c.category;
    return COURSE_CATEGORY_MAP[c.id] || 'general_nursing';
  };

  // Which specialties have at least one session?
  const specialtiesWithAttempts = NURSING_CATEGORIES.filter(cat => {
    const catCourseIds = allCourses
      .filter(c => courseSpecialtyId(c) === cat.id || courseSpecialtyId(c) === 'all')
      .map(c => c.id);
    return sessions.some(s => catCourseIds.includes(s.course));
  });

  // Attempt count per course id
  const attemptsByCourse = {};
  sessions.forEach(s => {
    const key = s.course || 'unknown';
    if (!attemptsByCourse[key]) attemptsByCourse[key] = [];
    attemptsByCourse[key].push(s);
  });

  // Courses for selected specialty that have at least one attempt
  const coursesForSpecialty = specialty
    ? allCourses.filter(c => {
        const mapped = courseSpecialtyId(c);
        return mapped === specialty.id || mapped === 'all';
      })
    : [];

  const coursesWithAttempts = coursesForSpecialty.filter(c =>
    (attemptsByCourse[c.id]?.length || 0) > 0
  );

  // Attempts for selected course, filtered by search
  const courseAttempts = course
    ? (attemptsByCourse[course.id] || []).filter(s => {
        if (!search) return true;
        const d = formatDate(s.completedAt);
        return d.toLowerCase().includes(search.toLowerCase());
      })
    : [];

  const handleRetake = (s) => {
    const p = new URLSearchParams({
      examType:    'course_drill',
      course:      s.course   || course?.id || '',
      category:    s.category || specialty?.id || '',
      courseLabel: course?.label || '',
      count:       String(s.totalQuestions || 20),
      timeLimit:   '30',
      shuffle:     'true',
      showExpl:    'false',
      retake:      'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  const handleReview = (s) => {
    const p = new URLSearchParams({
      resultId:  s.id,
      examId:    s.examId   || '',
      examName:  s.examName || `${course?.label || 'Course'} Drill`,
      mode:      'review',
    });
    navigate(`/exam/review?${p.toString()}`);
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  const scoreColor = (score) =>
    score >= 70 ? 'var(--green)' : score >= 50 ? '#F59E0B' : '#EF4444';

  // ── STEP 3 — Attempts list for selected course ─────────────────
  if (step === 3 && course) {
    const allAttempts = attemptsByCourse[course.id] || [];
    const takenCount  = allAttempts.length;
    const avgScore    = takenCount > 0
      ? Math.round(allAttempts.reduce((s, e) => s + (e.scorePercent || 0), 0) / takenCount)
      : null;
    const bestScore   = takenCount > 0
      ? Math.max(...allAttempts.map(e => e.scorePercent || 0))
      : null;

    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <button onClick={() => { setStep(2); setSearch(''); }} style={styles.backBtn}>
          ← Back to Courses
        </button>

        {/* Course header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
          padding: '16px 20px',
          background: `${specialty.color}12`,
          border: `1.5px solid ${specialty.color}30`,
          borderRadius: 14,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: `${specialty.color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>
            {course.icon || '📖'}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
              {specialty.icon} {specialty.shortLabel}
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)' }}>
              {course.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {takenCount} attempt{takenCount !== 1 ? 's' : ''} recorded
            </div>
          </div>
        </div>

        {/* Stats strip */}
        {takenCount > 0 && (
          <div style={styles.statsStrip}>
            <StatCard emoji="🔁" label="Attempts"   value={takenCount} />
            <StatCard emoji="🏆" label="Best Score" value={`${bestScore}%`}
              color={bestScore >= 70 ? 'var(--green)' : bestScore >= 50 ? '#F59E0B' : '#EF4444'} />
            <StatCard emoji="📊" label="Avg Score"  value={avgScore !== null ? `${avgScore}%` : '—'}
              color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : '#EF4444'} />
          </div>
        )}

        {/* Retake button */}
        <button
          className="btn btn-primary"
          style={{ marginBottom: 24 }}
          onClick={() => {
            const p = new URLSearchParams({
              examType:    'course_drill',
              course:      course.id,
              category:    specialty.id,
              courseLabel: course.label,
              count:       '20',
              timeLimit:   '30',
              shuffle:     'true',
              showExpl:    'false',
            });
            navigate(`/exam/session?${p.toString()}`);
          }}
        >
          {takenCount > 0 ? '🔄 Retake Course Drill' : '▶ Start Course Drill'}
        </button>

        {/* Search */}
        <input
          className="form-input"
          style={{ width: '100%', maxWidth: 320, marginBottom: 20, height: 40 }}
          placeholder="🔍 Search by date…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Attempts list */}
        {courseAttempts.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {search ? 'No attempts match your search' : 'No attempts yet'}
            </div>
            {search && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>Clear search</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {courseAttempts.map((s, i) => {
              const score  = s.scorePercent ?? 0;
              const sc     = scoreColor(score);
              return (
                <div key={s.id} style={{
                  ...styles.examCard,
                  borderLeft: `4px solid ${sc}`,
                }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

                    <div style={{
                      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      background: `${sc}18`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                    }}>
                      {score >= 70 ? '🏆' : score >= 50 ? '✅' : '❌'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                          Attempt #{takenCount - i}
                        </span>
                        <span style={badgeStyle(sc)}>
                          {score >= 50 ? '✅' : '❌'} {score}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span style={styles.meta}>📅 {formatDate(s.completedAt)}</span>
                        <span style={styles.meta}>🕐 {formatTime(s.completedAt)}</span>
                        {s.totalQuestions && <span style={styles.meta}>❓ {s.totalQuestions} questions</span>}
                        {s.correct !== undefined && s.totalQuestions && (
                          <span style={styles.meta}>✔ {s.correct}/{s.totalQuestions} correct</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleReview(s)}>
                        👁 Review
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRetake(s)}>
                        🔁 Retake
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 2 — Courses with attempts ────────────────────────────
  if (step === 2 && specialty) {
    const filtered = coursesWithAttempts.filter(c =>
      c.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <button onClick={() => { setStep(1); setSearch(''); }} style={styles.backBtn}>
          ← Back to Specialties
        </button>

        {/* Specialty header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
          padding: '16px 20px',
          background: `${specialty.color}12`,
          border: `1.5px solid ${specialty.color}30`,
          borderRadius: 14,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: `${specialty.color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>
            {specialty.icon}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)' }}>
              {specialty.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {coursesWithAttempts.length} course{coursesWithAttempts.length !== 1 ? 's' : ''} with attempts · Select one to view
            </div>
          </div>
        </div>

        <input className="form-input"
          style={{ width: '100%', maxWidth: 320, marginBottom: 20, height: 40 }}
          placeholder="🔍 Search courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <div style={styles.emptyState}><span className="spinner" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              No courses with attempts found
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/course-drill')}>
              📖 Start a Course Drill
            </button>
          </div>
        ) : (
          <div style={styles.courseGrid}>
            {filtered.map(c => {
              const attempts   = attemptsByCourse[c.id] || [];
              const count      = attempts.length;
              const bestScore  = count > 0 ? Math.max(...attempts.map(a => a.scorePercent || 0)) : null;
              const sc         = bestScore !== null ? scoreColor(bestScore) : 'var(--teal)';
              return (
                <button
                  key={c.id}
                  onClick={() => { setCourse(c); setStep(3); setSearch(''); }}
                  style={{
                    ...styles.courseCard,
                    borderColor: `${specialty.color}40`,
                    background:  `${specialty.color}08`,
                  }}
                >
                  <div style={{ ...styles.courseIconBox, background: `${specialty.color}20` }}>
                    <span style={{ fontSize: 24 }}>{c.icon || '📖'}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.3, marginTop: 8 }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                    {count} attempt{count !== 1 ? 's' : ''}
                  </div>
                  {bestScore !== null && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: sc, marginTop: 2 }}>
                      Best: {bestScore}%
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 1 — Specialty Picker ──────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => navigate('/course-drill')} style={styles.backBtn}>
          ← Back to Course Drill
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 32 }}>📚</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Course Drill Archive
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Choose a nursing specialty to browse courses and your past drill attempts.
        </p>
      </div>

      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading archive…</div>

      ) : sessions.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No course drills taken yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
            Complete a Course Drill and it will automatically appear here.
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/course-drill')}>
            📖 Start a Course Drill
          </button>
        </div>

      ) : specialtiesWithAttempts.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No results found</div>
        </div>

      ) : (
        <>
          <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>
          <div style={styles.catGrid}>
            {specialtiesWithAttempts.map(cat => {
              const catCourseIds  = allCourses
                .filter(c => courseSpecialtyId(c) === cat.id || courseSpecialtyId(c) === 'all')
                .map(c => c.id);
              const attemptCount  = sessions.filter(s => catCourseIds.includes(s.course)).length;
              const courseCount   = catCourseIds.filter(id => (attemptsByCourse[id]?.length || 0) > 0).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => { setSpecialty(cat); setStep(2); }}
                  style={{
                    ...styles.catCard,
                    borderColor: `${cat.color}60`,
                    background:  `${cat.color}0D`,
                  }}
                >
                  <div style={{ ...styles.catAccent, background: cat.color }} />
                  <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                    <span style={{ fontSize: 26 }}>{cat.icon}</span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {cat.shortLabel}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {courseCount} course{courseCount !== 1 ? 's' : ''} · {attemptCount} attempt{attemptCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ emoji, label, value, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

const badgeStyle = (color) => ({
  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
  background: `${color}18`, color, border: `1px solid ${color}40`,
});

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  sectionHead: {
    fontWeight: 700, fontSize: 15, color: 'var(--text-primary)',
    marginBottom: 16, letterSpacing: 0.2,
  },
  catGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12,
  },
  catCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '16px 18px', borderRadius: 14,
    border: '1.5px solid', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
    position: 'relative', overflow: 'hidden',
    background: 'var(--bg-card)',
  },
  catAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, borderRadius: '4px 0 0 4px',
  },
  catIconBox: {
    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  courseGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12,
  },
  courseCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '18px 12px', borderRadius: 14,
    border: '1.5px solid', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.18s',
    background: 'var(--bg-card)',
  },
  courseIconBox: {
    width: 56, height: 56, borderRadius: 14, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  statsStrip: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 18px',
    display: 'flex', alignItems: 'center', gap: 10,
    flex: '1 1 110px', minWidth: 100,
  },
  examCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.2s',
  },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};
