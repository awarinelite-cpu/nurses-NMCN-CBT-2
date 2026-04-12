// src/components/exam/DailyPracticePage.jsx
// Route: /daily-practice
//
// FLOW:
//   Step 1 — Choose a Nursing Category (grid)
//   Step 2 — ExamListPage  (/exam/list)
//   Step 3 — ExamSetupPage (/exam/setup)
//   Step 4 — ExamSession   (/exam/session)

import { useNavigate } from 'react-router-dom';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function DailyPracticePage() {
  const navigate = useNavigate();

  const handleCategoryClick = (cat) => {
    navigate('/exam/list', {
      state: {
        examType:  'daily_practice',
        category:  cat.id,
      },
    });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 32 }}>⚡</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Daily Practice Quiz
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Choose a nursing category to see available practice exams.
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator step={1} steps={['Choose Category', 'Choose Exam', 'Set Up', 'Take Exam']} />

      {/* Section label */}
      <div style={styles.sectionHead}>🏥 Choose a Nursing Category</div>

      {/* Category grid */}
      <div style={styles.catGrid}>
        {NURSING_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat)}
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
                {cat.examType === 'basic' ? 'Basic RN' : 'Post Basic'}
              </div>
            </div>
            <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepIndicator({ step, steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const num    = i + 1;
        const done   = step > num;
        const active = step === num;
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
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--teal)' : 'var(--text-muted)' }}>
                {label}
              </span>
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
  sectionHead: { fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:  { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox:{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
