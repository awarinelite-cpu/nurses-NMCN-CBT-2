// src/components/exam/ExamSetupPage.jsx
// Route: /exam/setup
//
// Shown after student picks an exam from ExamListPage.
// Lets them choose question count, time limit, shuffle.
// Then navigates to /exam/session.

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { NURSING_CATEGORIES } from '../../data/categories';

const TIME_OPTIONS = [
  { label: 'No Timer',  value: 0   },
  { label: '15 mins',   value: 15  },
  { label: '30 mins',   value: 30  },
  { label: '1 hour',    value: 60  },
  { label: '2 hours',   value: 120 },
];

export default function ExamSetupPage() {
  const navigate    = useNavigate();
  const { state }   = useLocation();

  const examId        = state?.examId        || '';
  const examName      = state?.examName      || 'Exam';
  const examType      = state?.examType      || 'daily_practice';
  const category      = state?.category      || '';
  const course        = state?.course        || '';
  const courseLabel   = state?.courseLabel   || '';
  const topic         = state?.topic         || '';
  const totalQuestions = Number(state?.totalQuestions || 0);
  const reviewMode    = state?.reviewMode    || false;

  const catInfo = NURSING_CATEGORIES.find(c => c.id === category);

  // Question count options capped to available
  const COUNTS = [10, 20, 30, 50, 100].filter(n => n <= totalQuestions);
  if (totalQuestions > 0 && !COUNTS.includes(totalQuestions) && totalQuestions < 100) {
    COUNTS.push(totalQuestions);
    COUNTS.sort((a, b) => a - b);
  }

  const [count,     setCount]     = useState(COUNTS[0] || totalQuestions || 20);
  const [timeLimit, setTimeLimit] = useState(30);
  const [shuffle,   setShuffle]   = useState(true);
  const [showExpl,  setShowExpl]  = useState(false);

  const handleStart = () => {
    navigate('/exam/session', {
      state: {
        examId,
        examName,
        examType,
        category,
        course,
        courseLabel,
        topic,
        count,
        timeLimit,
        doShuffle: shuffle,
        showExpl,
        reviewMode,
      },
    });
  };

  const typeLabel = {
    daily_practice: '⚡ Daily Practice',
    course_drill:   '📖 Course Drill',
    topic_drill:    '🎯 Topic Drill',
  }[examType] || 'Exam';

  const previewRows = [
    ['🏥 Category',   catInfo?.shortLabel || category],
    ...(course ? [['📖 Course', courseLabel]] : []),
    ...(topic  ? [['🎯 Topic',  topic]]        : []),
    ['❓ Questions',  `${count} of ${totalQuestions}`],
    ['⏱ Time',        timeLimit ? `${timeLimit} mins` : 'Unlimited'],
    ['🔀 Shuffle',    shuffle ? 'Yes' : 'No'],
  ];

  return (
    <div style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>

      {/* Back */}
      <button onClick={() => navigate(-1)} style={styles.backBtn}>
        ← Back to Exams
      </button>

      {/* Exam name pill */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${catInfo?.color || '#0D9488'}18`,
        border: `1.5px solid ${catInfo?.color || '#0D9488'}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 18,
        maxWidth: '100%',
      }}>
        <span style={{ fontSize: 20 }}>{catInfo?.icon || '📋'}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: catInfo?.color || 'var(--teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {typeLabel}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260,
          }}>
            {examName}
          </div>
        </div>
      </div>

      <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 4px', color: 'var(--text-primary)' }}>
        ⚙️ Set Up Your Exam
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' }}>
        Customise your session
      </p>

      {totalQuestions === 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: '#EF4444',
        }}>
          ⚠️ No questions available for this exam yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Question count */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>
            ❓ Number of Questions
            {totalQuestions > 0 && (
              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                ({totalQuestions} available)
              </span>
            )}
          </div>
          {COUNTS.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              No questions available.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {COUNTS.map(n => (
                <button key={n} onClick={() => setCount(n)} style={{
                  ...styles.chipBtn,
                  borderColor: count === n ? 'var(--blue-mid)' : 'var(--border)',
                  background:  count === n ? 'var(--blue-glow)' : 'var(--bg-tertiary)',
                  color:       count === n ? 'var(--blue-mid)'  : 'var(--text-secondary)',
                }}>{n} Qs</button>
              ))}
            </div>
          )}
        </div>

        {/* Time limit */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>⏱ Time Limit</div>
          <select className="form-input form-select" value={timeLimit}
            onChange={e => setTimeLimit(Number(e.target.value))}
            style={{ marginTop: 8, maxWidth: 220 }}>
            {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Options */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>⚙️ Options</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <ToggleRow
              label="🔀 Shuffle Questions"
              desc="Randomise question order each session"
              checked={shuffle}
              onChange={setShuffle}
            />
            <ToggleRow
              label="💡 Show Explanations After"
              desc="Display answer explanations during review"
              checked={showExpl}
              onChange={setShowExpl}
            />
          </div>
        </div>

        {/* Preview + Start */}
        <div className="card" style={{ ...styles.section, background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 14 }}>
            👁️ Exam Preview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {previewRows.map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleStart}
            disabled={totalQuestions === 0}
            style={{ fontSize: 16, padding: '14px' }}
          >
            🚀 Start Exam
          </button>
        </div>
      </div>
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
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  section:     { padding: '18px 16px' },
  sectionHead: { fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 },
  chipBtn: {
    padding: '8px 16px', border: '2px solid', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', transition: 'all 0.2s',
  },
};
