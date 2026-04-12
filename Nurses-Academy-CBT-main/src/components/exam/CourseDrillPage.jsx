// src/components/exam/CourseDrillPage.jsx
// Route: /course-drill
//
// FLOW:
//   Step 1 — Choose a Nursing Specialty (grid)
//   Step 2 — Choose a Course (grid filtered by specialty via course.category)
//   Step 3 — Set Up Your Exam (count, time limit, shuffle, explanations)
//   Step 4 — /exam/session
//
// Courses come from DEFAULT_NURSING_COURSES (all have category field now)
// PLUS any custom courses admin saved to Firestore 'courses' collection.
// Both use course.category to match specialties — newly added Firestore
// courses automatically appear here without any code change.

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db }                   from '../../firebase/config';
import { DEFAULT_NURSING_COURSES, NURSING_CATEGORIES } from '../../data/categories';
import { useAuth }              from '../../context/AuthContext';

const QUESTION_COUNTS = [10, 20, 30, 50, 100];
const TIME_OPTIONS = [
  { label: 'No Timer',  value: 0   },
  { label: '15 mins',   value: 15  },
  { label: '30 mins',   value: 30  },
  { label: '1 hour',    value: 60  },
  { label: '2 hours',   value: 120 },
];

export default function CourseDrillPage() {
  const { profile }  = useAuth();
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();

  // If CategoryPickerPage already chose a specialty, pre-select it and skip step 1
  const presetCategoryId = searchParams.get('category') || '';
  const presetSpecialty  = presetCategoryId
    ? NURSING_CATEGORIES.find(c => c.id === presetCategoryId) || null
    : null;

  const [step,           setStep]           = useState(presetSpecialty ? 2 : 1);
  const [specialty,      setSpecialty]      = useState(presetSpecialty);
  const [course,         setCourse]         = useState(null);
  const [allCourses,     setAllCourses]     = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [search,         setSearch]         = useState('');

  const [count,     setCount]     = useState(20);
  const [timeLimit, setTimeLimit] = useState(30);
  const [shuffle,   setShuffle]   = useState(true);
  const [showExpl,  setShowExpl]  = useState(false);

  // Load default courses + Firestore custom courses, minus admin-hidden defaults
  useEffect(() => {
    const load = async () => {
      setLoadingCourses(true);
      try {
        const [courseSnap, deletedSnap] = await Promise.all([
          getDocs(collection(db, 'courses')),
          getDocs(collection(db, 'deletedDefaultCourses')),
        ]);
        const custom      = courseSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const deletedIds  = deletedSnap.docs.map(d => d.id);
        const defIds      = DEFAULT_NURSING_COURSES.map(c => c.id);
        const customById  = Object.fromEntries(custom.map(c => [c.id, c]));

        // Active defaults — prefer Firestore version if admin updated a default course
        const activeDefaults = DEFAULT_NURSING_COURSES
          .filter(c => !deletedIds.includes(c.id))
          .map(c => customById[c.id] || c);

        // Purely new courses admin added (not in DEFAULT_NURSING_COURSES)
        const extras = custom.filter(c => !defIds.includes(c.id) && !deletedIds.includes(c.id));

        setAllCourses([...activeDefaults, ...extras]);
      } catch {
        setAllCourses(DEFAULT_NURSING_COURSES);
      } finally {
        setLoadingCourses(false);
      }
    };
    load();
  }, []);

  // Filter by specialty using course.category — works for both default & Firestore courses
  const coursesForSpecialty = specialty
    ? allCourses.filter(c => c.category === specialty.id)
    : [];

  const filteredCourses = coursesForSpecialty.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleStartExam = () => {
    if (!course || !specialty) return;
    const p = new URLSearchParams({
      examType:    'course_drill',
      course:      course.id,
      courseLabel: course.label,
      category:    specialty.id,
      count:       String(count),
      timeLimit:   String(timeLimit),
      shuffle:     String(shuffle),
      showExpl:    String(showExpl),
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  // ── STEP 1 — Specialty Picker ──────────────────────────────────
  if (step === 1) {
    const specialtiesWithCourses = NURSING_CATEGORIES.filter(cat =>
      allCourses.some(c => c.category === cat.id)
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
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Choose a nursing specialty to see its courses and start a focused drill.
          </p>
        </div>

        <StepIndicator step={1} />
        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

        {loadingCourses ? (
          <div style={styles.emptyState}><span className="spinner" /> Loading…</div>
        ) : (
          <div style={styles.catGrid}>
            {specialtiesWithCourses.map(cat => {
              const courseCount = allCourses.filter(c => c.category === cat.id).length;
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
                      {courseCount} course{courseCount !== 1 ? 's' : ''}
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

  // ── STEP 2 — Course Picker ─────────────────────────────────────
  if (step === 2) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <button onClick={() => { setStep(1); setSearch(''); }} style={styles.backBtn}>
          ← Back to Specialties
        </button>

        <StepIndicator step={2} />

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
          borderRadius: 40, padding: '8px 16px', marginBottom: 18,
        }}>
          <span style={{ fontSize: 20 }}>{specialty.icon}</span>
          <div>
            <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Selected Specialty
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{specialty.label}</div>
          </div>
          <button onClick={() => setStep(1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '0 0 0 4px' }}>✕</button>
        </div>

        <div style={styles.sectionHead}>📖 Choose a Course</div>

        <input className="form-input"
          style={{ width: '100%', maxWidth: 320, marginBottom: 20, height: 40 }}
          placeholder="🔍 Search courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loadingCourses ? (
          <div style={styles.emptyState}><span className="spinner" /> Loading courses…</div>
        ) : filteredCourses.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {search ? `No courses match "${search}"` : 'No courses for this specialty yet'}
            </div>
            {search && <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>Clear search</button>}
          </div>
        ) : (
          <div style={styles.courseGrid}>
            {filteredCourses.map(c => (
              <button key={c.id}
                onClick={() => { setCourse(c); setStep(3); }}
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Tap to select →</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 3 — Exam Setup ────────────────────────────────────────
  const previewRows = [
    ['🏥 Specialty',  specialty?.shortLabel || '—'],
    ['📖 Course',     course?.label         || '—'],
    ['📋 Type',       'Course Drill'],
    ['❓ Questions',   count],
    ['⏱ Time',        timeLimit ? `${timeLimit} mins` : 'Unlimited'],
    ['🔀 Shuffle',     shuffle ? 'Yes' : 'No'],
    ['💡 Explain',     showExpl ? 'Yes' : 'No'],
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto' }}>
      <button onClick={() => setStep(2)} style={styles.backBtn}>← Back to Courses</button>

      <StepIndicator step={3} />

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 18,
      }}>
        <span style={{ fontSize: 20 }}>{course.icon || '📖'}</span>
        <div>
          <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {specialty.shortLabel} · Course Drill
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{course.label}</div>
        </div>
        <button onClick={() => setStep(2)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '0 0 0 4px' }}>✕</button>
      </div>

      <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 4px', color: 'var(--text-primary)' }}>
        ⚙️ Set Up Your Exam
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' }}>Customise your course drill session</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={styles.section}>
          <div style={styles.sectionHeadSm}>❓ Number of Questions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {QUESTION_COUNTS.map(n => (
              <button key={n} onClick={() => setCount(n)} style={{
                ...styles.chipBtn,
                borderColor: count === n ? 'var(--blue-mid)' : 'var(--border)',
                background:  count === n ? 'var(--blue-glow)' : 'var(--bg-tertiary)',
                color:       count === n ? 'var(--blue-mid)' : 'var(--text-secondary)',
              }}>{n} Qs</button>
            ))}
          </div>
        </div>

        <div className="card" style={styles.section}>
          <div style={styles.sectionHeadSm}>⏱ Time Limit</div>
          <select className="form-input form-select" value={timeLimit}
            onChange={e => setTimeLimit(Number(e.target.value))}
            style={{ marginTop: 8, maxWidth: 220 }}>
            {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="card" style={styles.section}>
          <div style={styles.sectionHeadSm}>⚙️ Options</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <ToggleRow label="🔀 Shuffle Questions" desc="Randomise question order each session" checked={shuffle} onChange={setShuffle} />
            <ToggleRow label="💡 Show Explanations After" desc="Display answer explanations during review" checked={showExpl} onChange={setShowExpl} />
          </div>
        </div>

        <div className="card" style={{ ...styles.section, background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 14 }}>👁️ Exam Preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {previewRows.map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-full btn-lg" onClick={handleStartExam} style={{ fontSize: 16, padding: '14px' }}>
            🚀 Start Course Drill
          </button>
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-hint)', marginTop: 10 }}>
            Your result will be saved automatically. View past attempts in Course Drill Archive.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }) {
  const steps = ['Choose Specialty', 'Choose Course', 'Set Up Exam', 'Take Exam'];
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

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)} style={{
        width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--teal)' : 'var(--border)',
        position: 'relative', transition: 'background 0.25s', flexShrink: 0,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: checked ? 23 : 3,
          transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
      </button>
    </div>
  );
}

const styles = {
  backBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  sectionHead: { fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  sectionHeadSm: { fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 },
  section: { padding: '18px 16px' },
  catGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox: { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  courseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 },
  courseCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.18s', background: 'var(--bg-card)' },
  courseIconBox: { width: 56, height: 56, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chipBtn: { padding: '8px 16px', border: '2px solid', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.2s' },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};