// src/components/exam/TopicDrillPage.jsx
// Route: /topic-drill
//
// FLOW (NEW — Unified Pool):
//   Step 1 — Choose a Nursing Specialty
//   Step 2 — Choose a Course
//   Step 3 — Choose a Topic (built from distinct topic values in questions collection)
//   Step 4 — ExamSession (/exam/session) with poolMode:true, topic+course filter
//
// Topics are derived live from the questions collection — no separate exam doc needed.
// Upload questions with topic + course tags; they appear here automatically.

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
  // { topicName: questionCount }
  const [topicMap,  setTopicMap]  = useState({});
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');

  // Load all courses once
  useEffect(() => {
    getDocs(collection(db, 'courses'))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        setCourses(all);
      })
      .catch(() => {});
  }, []);

  // When a course is selected, load distinct topics and their question counts
  // directly from the questions collection — no exams collection needed.
  useEffect(() => {
    if (!course) return;
    setLoading(true);
    getDocs(query(
      collection(db, 'questions'),
      where('course',  '==', course.id),
      where('active',  '==', true),
    ))
      .then(snap => {
        // Build a map of topic → count
        const map = {};
        snap.docs.forEach(d => {
          const t = d.data().topic;
          if (t) map[t] = (map[t] || 0) + 1;
        });
        setTopicMap(map);
      })
      .catch(() => setTopicMap({}))
      .finally(() => setLoading(false));
  }, [course]);

  const coursesForSpecialty = specialty
    ? courses.filter(c => c.category === specialty.id && c.active !== false)
    : [];

  // Sorted list of topics with at least 1 question
  const allTopics = Object.entries(topicMap)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const filteredTopics = allTopics.filter(([t]) =>
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
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Drill down to a <strong style={{ color: 'var(--text-primary)' }}>specific topic</strong> — questions are pulled from the shared bank, filtered by topic.
          </p>
        </div>

        <StepIndicator step={1} steps={['Specialty', 'Course', 'Topic', 'Take Exam']} />
        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

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
        <StepIndicator step={2} steps={['Specialty', 'Course', 'Topic', 'Take Exam']} />

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
                onClick={() => { setCourse(c); setStep(3); setSearch(''); setTopicMap({}); }}
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
      <button onClick={() => { setStep(2); setCourse(null); setTopicMap({}); }} style={styles.backBtn}>← Back to Courses</button>
      <StepIndicator step={3} steps={['Specialty', 'Course', 'Topic', 'Take Exam']} />

      <SelectedPill icon={course.icon || '📖'} color={specialty.color} label="Selected Course" value={course.label}
        onClear={() => { setStep(2); setCourse(null); setTopicMap({}); }} />

      <div style={styles.sectionHead}>🎯 Choose a Topic</div>

      <input className="form-input" placeholder="🔍 Search topics..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : filteredTopics.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {allTopics.length === 0 ? 'No topics available yet' : 'No topics match your search'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {allTopics.length === 0 && "Upload questions tagged with a topic and this course to see them here."}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTopics.map(([topic, count], idx) => (
            <button
              key={topic}
              onClick={() => navigate('/exam/session', {
                state: {
                  poolMode:    true,
                  examType:    'topic_drill',
                  examName:    `${topic} — Topic Drill`,
                  category:    specialty.id,
                  course:      course.id,
                  courseLabel: course.label,
                  topic,
                  doShuffle:   true,
                  timeLimit:   0,
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {count} question{count !== 1 ? 's' : ''}
                </div>
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
  backBtn:     { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  sectionHead: { fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:     { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox:  { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  courseGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 },
  courseCard:  { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px 14px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.18s', background: 'var(--bg-card)' },
  courseIconBox: { width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyState:  { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};
