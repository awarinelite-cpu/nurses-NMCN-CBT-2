// src/components/exam/TopicDrillPage.jsx
// Route: /topic-drill
//
// FLOW:
//   Step 1 — Choose a Nursing Specialty
//   Step 2 — Choose a Course
//   Step 3 — Choose a Topic (searchable list, from uploaded exams)
//   Step 4 — ExamListPage  (/exam/list)
//   Step 5 — ExamSetupPage (/exam/setup)
//   Step 6 — ExamSession   (/exam/session)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function TopicDrillPage() {
  const navigate = useNavigate();

  const [step,      setStep]      = useState(1);
  const [specialty, setSpecialty] = useState(null);
  const [course,    setCourse]    = useState(null);
  const [courses,   setCourses]   = useState([]);
  const [topics,    setTopics]    = useState([]);  // distinct topics from 'exams' collection
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');
  const [debug,     setDebug]     = useState(null); // ← temporary debug info

  // Load all courses once
  useEffect(() => {
    getDocs(collection(db, 'courses'))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        setCourses(all);
        setDebug(d => ({ ...d,
          coursesLoaded: all.length,
          coursesSample: all.slice(0, 3).map(c => `${c.id} (category: ${c.category}, active: ${c.active})`),
        }));
      })
      .catch(e => {
        setDebug(d => ({ ...d, coursesError: e.message }));
      });
  }, []);

  // Load topics when a course is selected
  useEffect(() => {
    if (!course) return;
    setLoading(true);
    setDebug(d => ({ ...d, topicsQuery: { examType: 'topic_drill', course: course.id, active: true } }));
    getDocs(query(
      collection(db, 'exams'),
      where('examType', '==', 'topic_drill'),
      where('course',   '==', course.id),
      where('active',   '==', true),
    ))
      .then(snap => {
        const exams = snap.docs.map(d => d.data());
        setDebug(d => ({ ...d,
          examsFound: exams.length,
          examsSample: exams.slice(0, 3).map(e => `topic:"${e.topic}" totalQ:${e.totalQuestions} active:${e.active}`),
          examsWithZeroQ: exams.filter(e => (e.totalQuestions || 0) === 0).length,
        }));
        // Collect distinct non-empty topics from exams that still have questions
        const topicSet = [...new Set(
          exams
            .filter(e => (e.totalQuestions || 0) > 0)
            .map(e => e.topic).filter(Boolean)
        )].sort();
        setTopics(topicSet);
      })
      .catch(e => {
        setDebug(d => ({ ...d, topicsError: e.message }));
        setTopics([]);
      })
      .finally(() => setLoading(false));
  }, [course]);

  const coursesForSpecialty = specialty
    ? courses.filter(c => c.category === specialty.id && c.active !== false)
    : [];

  const filteredTopics = topics.filter(t =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  // ── STEP 1 — Specialty ────────────────────────────────────────────────────
  if (step === 1) {
    const specialtiesWithCourses = NURSING_CATEGORIES.filter(cat =>
      courses.some(c => c.category === cat.id && c.active !== false)
    );

    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>🎯</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Topic Drill
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Drill down by specialty, course, and topic.
          </p>
        </div>

        <StepIndicator step={1} steps={['Specialty', 'Course', 'Topic', 'Choose Exam', 'Set Up', 'Take Exam']} />
        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

        {/* ── TEMP DEBUG PANEL — remove after diagnosis ── */}
        {debug && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>
            <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: 6 }}>🔍 DEBUG — Courses Firestore Load</div>
            <div>Total courses loaded: <span style={{ color: '#4ade80' }}>{debug.coursesLoaded ?? '...'}</span></div>
            {debug.coursesError && <div style={{ color: '#f87171' }}>Error: {debug.coursesError}</div>}
            {debug.coursesSample?.map((s, i) => <div key={i} style={{ color: '#e2e8f0' }}>  {s}</div>)}
            <div style={{ marginTop: 6 }}>Specialties with courses shown: <span style={{ color: '#4ade80' }}>{NURSING_CATEGORIES.filter(cat => courses.some(c => c.category === cat.id && c.active !== false)).length}</span></div>
          </div>
        )}

        <div style={styles.catGrid}>
          {specialtiesWithCourses.map(cat => (
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
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>{cat.shortLabel}</div>
                <div style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>
                  {courses.filter(c => c.category === cat.id && c.active !== false).length} courses
                </div>
              </div>
              <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STEP 2 — Course ───────────────────────────────────────────────────────
  if (step === 2) {
    const filtered = coursesForSpecialty.filter(c =>
      c.label?.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <button onClick={() => { setStep(1); setSpecialty(null); }} style={styles.backBtn}>← Back to Specialties</button>
        <StepIndicator step={2} steps={['Specialty', 'Course', 'Topic', 'Choose Exam', 'Set Up', 'Take Exam']} />

        <SelectedPill icon={specialty.icon} color={specialty.color} label="Selected Specialty" value={specialty.label}
          onClear={() => { setStep(1); setSpecialty(null); }} />

        <div style={styles.sectionHead}>📚 Choose a Course</div>
        <input className="form-input" placeholder="🔍 Search courses..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16, maxWidth: 400 }} />

        {filtered.length === 0 ? (
          <div style={styles.emptyState}><div style={{ fontSize: 40 }}>🔍</div><div>No courses found</div></div>
        ) : (
          <div style={styles.courseGrid}>
            {filtered.map(c => (
              <button key={c.id}
                onClick={() => { setCourse(c); setStep(3); setSearch(''); }}
                style={{ ...styles.courseCard, borderColor: `${specialty.color}40` }}>
                <div style={{ ...styles.courseIconBox, background: `${specialty.color}18`, marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>{c.icon || '📖'}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: specialty.color, fontWeight: 600 }}>View Topics →</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 3 — Topic ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 760 }}>
      <button onClick={() => { setStep(2); setCourse(null); setTopics([]); }} style={styles.backBtn}>← Back to Courses</button>
      <StepIndicator step={3} steps={['Specialty', 'Course', 'Topic', 'Choose Exam', 'Set Up', 'Take Exam']} />

      <SelectedPill icon={course.icon || '📖'} color={specialty.color} label="Selected Course" value={course.label}
        onClear={() => { setStep(2); setCourse(null); setTopics([]); }} />

      <div style={styles.sectionHead}>🎯 Choose a Topic</div>

      {/* ── TEMP DEBUG PANEL — remove after diagnosis ── */}
      {debug && (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>
          <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: 6 }}>🔍 DEBUG — Topic Query</div>
          <div>Query: examType=<span style={{ color: '#fbbf24' }}>topic_drill</span> course=<span style={{ color: '#fbbf24' }}>{debug.topicsQuery?.course}</span> active=true</div>
          <div>Exams found: <span style={{ color: '#4ade80' }}>{debug.examsFound ?? '...'}</span></div>
          <div>Exams with 0 questions (hidden): <span style={{ color: '#f87171' }}>{debug.examsWithZeroQ ?? 0}</span></div>
          {debug.topicsError && <div style={{ color: '#f87171' }}>Error: {debug.topicsError}</div>}
          {debug.examsSample?.map((s, i) => <div key={i} style={{ color: '#e2e8f0' }}>  exam {i+1}: {s}</div>)}
          <div style={{ marginTop: 6 }}>Topics extracted: <span style={{ color: '#4ade80' }}>{topics.length}</span> — {topics.join(', ') || 'none'}</div>
        </div>
      )}

      {/* Search */}
      <input className="form-input" placeholder="🔍 Search topics..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : filteredTopics.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {topics.length === 0 ? 'No topics available yet' : 'No topics match your search'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {topics.length === 0 && "Admin hasn't uploaded any topic drill exams for this course."}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTopics.map((topic, idx) => (
            <button
              key={topic}
              onClick={() => navigate('/exam/list', {
                state: {
                  examType:    'topic_drill',
                  category:    specialty.id,
                  course:      course.id,
                  courseLabel: course.label,
                  topic,
                },
              })}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: `${specialty.color}18`, color: specialty.color,
                fontWeight: 800, fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{topic}</div>
              </div>
              <span style={{ color: specialty.color, fontSize: 16, fontWeight: 900 }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedPill({ icon, color, label, value, onClear }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: `${color}18`, border: `1.5px solid ${color}40`,
      borderRadius: 40, padding: '8px 16px', marginBottom: 20,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      </div>
      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
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
                width: 26, height: 26, borderRadius: '50%',
                background: done || active ? 'var(--teal)' : 'var(--bg-tertiary)',
                border: `2px solid ${done || active ? 'var(--teal)' : 'var(--border)'}`,
                color: done || active ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900, flexShrink: 0, opacity: done ? 0.65 : 1,
              }}>{done ? '✓' : num}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--teal)' : 'var(--text-muted)' }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 16, height: 2, borderRadius: 2, margin: '0 4px', background: step > num ? 'var(--teal)' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  backBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  sectionHead:{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:    { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox: { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  courseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 },
  courseCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px 14px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.18s', background: 'var(--bg-card)' },
  courseIconBox: { width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};
