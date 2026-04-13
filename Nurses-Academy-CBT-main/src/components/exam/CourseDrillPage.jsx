// src/components/exam/CourseDrillPage.jsx
// Route: /course-drill
//
// FLOW (NEW — Unified Pool):
//   Step 1 — Choose a Nursing Specialty (category grid)
//   Step 2 — Choose a Course (filtered by specialty)
//   Step 3 — ExamSession (/exam/session) with poolMode:true, course filter
//            Pulls ALL questions tagged with this course from the shared
//            questions collection, across all topics under the course.
//
// Questions no longer live in separate exam docs per course.
// One upload with course + topic tags feeds all drill types.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function CourseDrillPage() {
  const navigate = useNavigate();

  const [step,      setStep]      = useState(1);
  const [specialty, setSpecialty] = useState(null);
  const [courses,   setCourses]   = useState([]);
  // Map of courseId → question count (loaded lazily per specialty)
  const [qCounts,   setQCounts]   = useState({});
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');

  // Load all courses once
  useEffect(() => {
    setLoading(true);
    getDocs(collection(db, 'courses'))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        setCourses(all);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  // When a specialty is selected, load question counts for its courses
  useEffect(() => {
    if (!specialty) return;
    const coursesInSpecialty = courses.filter(c => c.category === specialty.id && c.active !== false);
    if (coursesInSpecialty.length === 0) return;

    Promise.all(
      coursesInSpecialty.map(async c => {
        try {
          const snap = await getCountFromServer(
            query(collection(db, 'questions'), where('course', '==', c.id), where('active', '==', true))
          );
          return [c.id, snap.data().count];
        } catch {
          return [c.id, null];
        }
      })
    ).then(results => {
      setQCounts(prev => {
        const next = { ...prev };
        results.forEach(([id, count]) => { next[id] = count; });
        return next;
      });
    });
  }, [specialty, courses]);

  const coursesForSpecialty = specialty
    ? courses.filter(c => c.category === specialty.id && c.active !== false)
    : [];

  const filteredCourses = coursesForSpecialty.filter(c =>
    c.label?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCourseClick = (course) => {
    const qCount = qCounts[course.id];
    if (qCount === 0) return; // no questions yet — button is disabled
    navigate('/exam/session', {
      state: {
        poolMode:    true,
        examType:    'course_drill',
        examName:    `${course.label} — Course Drill`,
        category:    specialty.id,
        course:      course.id,
        courseLabel: course.label,
        doShuffle:   true,
        timeLimit:   0,
      },
    });
  };

  // ── STEP 1 — Specialty Picker ─────────────────────────────────────────────
  if (step === 1) {
    // Only show specialties that have at least one course with active questions
    const specialtiesWithCourses = NURSING_CATEGORIES.filter(cat =>
      courses.some(c => c.category === cat.id && c.active !== false)
    );

    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>📖</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Course Drill
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Pick a course and drill on <strong style={{ color: 'var(--text-primary)' }}>all topics under it</strong> — questions are pulled randomly from the shared question bank.
          </p>
        </div>

        <StepIndicator step={1} steps={['Choose Specialty', 'Choose Course', 'Take Exam']} />
        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : specialtiesWithCourses.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No courses available yet</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Admin hasn't added any active courses.</div>
          </div>
        ) : (
          <div style={styles.catGrid}>
            {specialtiesWithCourses.map(cat => {
              const count = courses.filter(c => c.category === cat.id && c.active !== false).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSpecialty(cat); setStep(2); setSearch(''); }}
                  style={{ ...styles.catCard, borderColor: `${cat.color}60`, background: `${cat.color}0D` }}
                >
                  <div style={{ ...styles.catAccent, background: cat.color }} />
                  <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                    <span style={{ fontSize: 26 }}>{cat.icon}</span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {cat.shortLabel}
                    </div>
                    <div style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>
                      {count} course{count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 2 — Course Picker ────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <button onClick={() => { setStep(1); setSpecialty(null); }} style={styles.backBtn}>
        ← Back to Specialties
      </button>

      <StepIndicator step={2} steps={['Choose Specialty', 'Choose Course', 'Take Exam']} />

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 20,
      }}>
        <span style={{ fontSize: 20 }}>{specialty.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Selected Specialty
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{specialty.label}</div>
        </div>
        <button onClick={() => { setStep(1); setSpecialty(null); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
      </div>

      <div style={styles.sectionHead}>📚 Choose a Course</div>
      <input className="form-input" placeholder="🔍 Search courses..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }} />

      {filteredCourses.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700 }}>No courses found</div>
        </div>
      ) : (
        <div style={styles.courseGrid}>
          {filteredCourses.map(course => {
            const qCount  = qCounts[course.id];
            const hasQs   = qCount === undefined || qCount > 0; // undefined = still loading → allow click
            const loading = qCount === undefined;

            return (
              <button
                key={course.id}
                onClick={() => handleCourseClick(course)}
                disabled={qCount === 0}
                style={{
                  ...styles.courseCard,
                  borderColor: `${specialty.color}40`,
                  opacity: qCount === 0 ? 0.5 : 1,
                  cursor: qCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <div style={{ ...styles.courseIconBox, background: `${specialty.color}18`, marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>{course.icon || '📖'}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 4 }}>
                  {course.label}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: qCount === 0 ? 'var(--text-muted)' : specialty.color }}>
                  {loading ? '…' : qCount === 0 ? 'No questions yet' : `${qCount} question${qCount !== 1 ? 's' : ''} →`}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step, steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const num = i + 1; const done = step > num; const active = step === num;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done || active ? 'var(--teal)' : 'var(--bg-tertiary)',
                border: `2px solid ${done || active ? 'var(--teal)' : 'var(--border)'}`,
                color: done || active ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 900, flexShrink: 0, opacity: done ? 0.65 : 1,
              }}>{done ? '✓' : num}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--teal)' : 'var(--text-muted)' }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 20, height: 2, borderRadius: 2, margin: '0 6px', background: step > num ? 'var(--teal)' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  backBtn:     { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  sectionHead: { fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:     { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox:  { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  courseGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  courseCard:  { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px 14px', borderRadius: 14, border: '1.5px solid', fontFamily: 'inherit', transition: 'all 0.18s', background: 'var(--bg-card)' },
  courseIconBox: { width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyState:  { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};
