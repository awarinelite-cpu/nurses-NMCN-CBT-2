// src/components/exam/CourseDrillArchivePage.jsx
// Route: /course-drill-archive
//
// Level 1 — grid of all courses
// Level 2 — click course → list of ALL published exams for that course
// Level 3 — click exam → student's attempts for that exam + Start/Retake button

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_NURSING_COURSES, NURSING_CATEGORIES } from '../../data/categories';

export default function CourseDrillArchivePage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [urlParams] = useSearchParams();

  const [allCourses,        setAllCourses]        = useState([]);
  const [publishedExams,    setPublishedExams]    = useState([]);
  const [sessions,          setSessions]          = useState([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState(null); // NEW — Level 0
  const [selectedCourse,    setSelectedCourse]    = useState(null);
  const [selectedExam,      setSelectedExam]      = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [search,            setSearch]            = useState('');

  // Load courses
  useEffect(() => {
    const loadCourses = async () => {
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
    loadCourses();
  }, []);

  // Auto-select course if URL param present (e.g. coming from CourseDrillPage)
  useEffect(() => {
    if (allCourses.length === 0) return;
    const courseParam = urlParams.get('course');
    if (courseParam) {
      const found = allCourses.find(c => c.id === courseParam);
      if (found) {
        // Also auto-select the specialty so breadcrumb is correct
        const specialty = NURSING_CATEGORIES.find(cat => cat.id === found.category);
        if (specialty) setSelectedSpecialty(specialty);
        setSelectedCourse(found);
      }
    }
  }, [allCourses]);

  // Load published exams + student sessions
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const [examSnap, sessSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'exams'),
            where('examType', '==', 'course_drill')
          )),
          getDocs(query(
            collection(db, 'examSessions'),
            where('userId',   '==', user.uid),
            where('examType', '==', 'course_drill'),
          )),
        ]);
const allExams = examSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          console.log('DEBUG exams fetched:', allExams.length, allExams.map(e => ({id:e.id, examType:e.examType, course:e.course, active:e.active})));
          setPublishedExams(
            allExams
              .filter(e => e.active !== false)
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          );
        setSessions(
          sessSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const ta = a.completedAt?.toDate?.()?.getTime?.() || 0;
              const tb = b.completedAt?.toDate?.()?.getTime?.() || 0;
              return tb - ta;
            })
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const handleStartExam = (exam) => {
    const p = new URLSearchParams({
      examType:    'course_drill',
      examId:      exam.id,
      examName:    exam.name,
      course:      exam.course,
      courseLabel: DEFAULT_NURSING_COURSES.find(c => c.id === exam.course)?.label || exam.course,
      count:       exam.totalQuestions || 20,
      timeLimit:   30,
      shuffle:     'false', // keep order for a specific published exam
      showExpl:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  // Group sessions by examId for quick lookup
  const sessionsByExam = {};
  sessions.forEach(s => {
    const key = s.examId || 'unknown';
    if (!sessionsByExam[key]) sessionsByExam[key] = [];
    sessionsByExam[key].push(s);
  });

  // ── Level 3: Exam attempts ─────────────────────────────────────
  if (selectedCourse && selectedExam) {
    const attempts = sessionsByExam[selectedExam.id] || [];
    const best = attempts.length > 0 ? Math.max(...attempts.map(s => s.scorePercent || 0)) : null;
    const avg  = attempts.length > 0
      ? Math.round(attempts.reduce((a, s) => a + (s.scorePercent || 0), 0) / attempts.length)
      : null;

    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <button onClick={() => setSelectedExam(null)} style={styles.backBtn}>
          ← Back to {selectedCourse.label} Exams
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <div style={{ ...styles.iconBox, fontSize:28, width:60, height:60, borderRadius:16 }}>
            {selectedCourse.icon || '📖'}
          </div>
          <div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:2 }}>
              {selectedSpecialty?.icon} {selectedSpecialty?.shortLabel} › {selectedCourse.label}
            </div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", margin:0, color:'var(--text-primary)', fontSize:'1.2rem' }}>
              {selectedExam.name}
            </h2>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
              {selectedExam.totalQuestions} questions
            </div>
          </div>
        </div>

        {attempts.length > 0 && (
          <div style={styles.statsStrip}>
            <StatCard emoji="🔁" label="Attempts"   value={attempts.length} />
            <StatCard emoji="🏆" label="Best Score" value={`${best}%`} color={best >= 70 ? 'var(--green)' : best >= 50 ? '#F59E0B' : '#EF4444'} />
            <StatCard emoji="📊" label="Avg Score"  value={`${avg}%`}  color={avg  >= 70 ? 'var(--green)' : avg  >= 50 ? '#F59E0B' : '#EF4444'} />
          </div>
        )}

        <button className="btn btn-primary" style={{ marginBottom:24 }}
          onClick={() => handleStartExam(selectedExam)}>
          {attempts.length > 0 ? '🔄 Retake Exam' : '▶ Start Exam'}
        </button>

        {attempts.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No attempts yet</div>
            <div style={{ color:'var(--text-muted)', fontSize:14 }}>Start the exam above to record your first attempt.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>
              Your Attempts
            </div>
            {attempts.map((s, i) => {
              const sc  = s.scorePercent || 0;
              const col = sc >= 70 ? 'var(--green)' : sc >= 50 ? '#F59E0B' : '#EF4444';
              const date = s.completedAt?.toDate
                ? new Date(s.completedAt.toDate()).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
                : 'Recently';
              return (
                <div key={s.id} style={{ ...styles.attemptRow, borderLeft:`4px solid ${col}` }}>
                  <div style={{ fontWeight:700, fontSize:14, color:col }}>#{i+1} — {sc}%</div>
                  <div style={{ fontSize:13, color:'var(--text-muted)' }}>
                    {s.correct}/{s.totalQuestions} correct · {date}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Level 2: Published exams for selected course ───────────────
  if (selectedSpecialty && selectedCourse) {
    const examsForCourse = publishedExams.filter(e => e.course === selectedCourse.id);

    return (
      <div style={{ padding:'24px', maxWidth:900 }}>
        <button onClick={() => setSelectedCourse(null)} style={styles.backBtn}>
          ← Back to {selectedSpecialty.shortLabel} Courses
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <div style={{ ...styles.iconBox, fontSize:28, width:56, height:56 }}>
            {selectedCourse.icon || '📖'}
          </div>
          <div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", margin:0, color:'var(--text-primary)' }}>
              {selectedCourse.label}
            </h2>
            <p style={{ color:'var(--text-muted)', fontSize:14, margin:'4px 0 0' }}>
              {examsForCourse.length} published exam{examsForCourse.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {examsForCourse.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No exams published yet</div>
            <div style={{ color:'var(--text-muted)', fontSize:14 }}>Check back later or ask your admin to upload questions.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {examsForCourse.map(exam => {
              const attempts  = sessionsByExam[exam.id] || [];
              const best      = attempts.length > 0 ? Math.max(...attempts.map(s => s.scorePercent || 0)) : null;
              const bestColor = best !== null ? (best >= 70 ? 'var(--green)' : best >= 50 ? '#F59E0B' : '#EF4444') : 'var(--text-muted)';
              const uploadDate = exam.createdAt?.toDate
                ? new Date(exam.createdAt.toDate()).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' })
                : '';

              return (
                <button key={exam.id} onClick={() => setSelectedExam(exam)} style={styles.examRow}>
                  <div style={{ ...styles.iconBox, fontSize:20, flexShrink:0 }}>📋</div>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)' }}>{exam.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>
                      {exam.totalQuestions} questions · {uploadDate}
                      {best !== null && (
                        <span style={{ color:bestColor, fontWeight:700, marginLeft:10 }}>
                          Best: {best}% ({attempts.length} attempt{attempts.length !== 1 ? 's' : ''})
                        </span>
                      )}
                      {best === null && <span style={{ marginLeft:10, color:'var(--text-muted)' }}>Not attempted</span>}
                    </div>
                  </div>
                  <span style={{ color:'var(--teal)', fontSize:18, flexShrink:0 }}>→</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Level 1: Courses grid for selected specialty ──────────────
  if (selectedSpecialty) {
    const coursesForSpecialty = allCourses.filter(c => c.category === selectedSpecialty.id);
    const filtered = coursesForSpecialty.filter(c =>
      !search || c.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div style={{ padding:'24px', maxWidth:900 }}>
        <button onClick={() => { setSelectedSpecialty(null); setSearch(''); }} style={styles.backBtn}>
          ← Back to Specialties
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24,
          padding:'16px 20px',
          background: `${selectedSpecialty.color}12`,
          border: `1.5px solid ${selectedSpecialty.color}30`,
          borderRadius:14,
        }}>
          <div style={{
            width:52, height:52, borderRadius:14, flexShrink:0,
            background:`${selectedSpecialty.color}22`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:26,
          }}>
            {selectedSpecialty.icon}
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:17, color:'var(--text-primary)' }}>
              {selectedSpecialty.label}
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
              {coursesForSpecialty.length} course{coursesForSpecialty.length !== 1 ? 's' : ''} · Select one to view exams
            </div>
          </div>
        </div>

        <input className="form-input"
          style={{ width:'100%', maxWidth:320, marginBottom:20, height:40 }}
          placeholder="🔍 Search courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <div style={styles.emptyState}><span className="spinner" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No courses found</div>
          </div>
        ) : (
          <div style={styles.grid}>
            {filtered.map(course => {
              const examsCount    = publishedExams.filter(e => e.course === course.id).length;
              const courseExamIds = publishedExams.filter(e => e.course === course.id).map(e => e.id);
              const attemptCount  = sessions.filter(s => courseExamIds.includes(s.examId)).length;
              return (
                <button key={course.id}
                  onClick={() => { setSelectedCourse(course); setSearch(''); }}
                  style={{
                    ...styles.courseCard,
                    borderColor: `${selectedSpecialty.color}40`,
                    background: `${selectedSpecialty.color}08`,
                  }}>
                  <div style={{ ...styles.iconBox, background:`${selectedSpecialty.color}20` }}>
                    {course.icon || '📖'}
                  </div>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--text-primary)', textAlign:'center', lineHeight:1.3 }}>
                    {course.label}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4, textAlign:'center' }}>
                    {examsCount > 0
                      ? `${examsCount} exam${examsCount !== 1 ? 's' : ''} · ${attemptCount} attempt${attemptCount !== 1 ? 's' : ''}`
                      : 'No exams yet'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Level 0: Specialty picker ──────────────────────────────────
  const specialtiesWithCourses = NURSING_CATEGORIES.filter(cat =>
    allCourses.some(c => c.category === cat.id)
  );

  return (
    <div style={{ padding:'24px', maxWidth:900 }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          <span style={{ fontSize:32 }}>📚</span>
          <h2 style={{ fontFamily:"'Playfair Display',serif", margin:0, color:'var(--text-primary)' }}>
            Course Drill Archive
          </h2>
        </div>
        <p style={{ color:'var(--text-muted)', fontSize:14, margin:0 }}>
          Choose a nursing specialty to browse courses and your past exam attempts.
        </p>
      </div>

      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading…</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12 }}>
          {specialtiesWithCourses.map(cat => {
            const catCourseIds  = allCourses.filter(c => c.category === cat.id).map(c => c.id);
            const catExamIds    = publishedExams.filter(e => catCourseIds.includes(e.course)).map(e => e.id);
            const examCount     = publishedExams.filter(e => catCourseIds.includes(e.course)).length;
            const attemptCount  = sessions.filter(s => catExamIds.includes(s.examId)).length;

            return (
              <button key={cat.id}
                onClick={() => setSelectedSpecialty(cat)}
                style={{
                  ...styles.specialtyCard,
                  borderColor: `${cat.color}60`,
                  background:  `${cat.color}0D`,
                }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:4, borderRadius:'4px 0 0 4px', background:cat.color }} />
                <div style={{ ...styles.iconBox, background:`${cat.color}20`, fontSize:26, width:52, height:52, borderRadius:14 }}>
                  {cat.icon}
                </div>
                <div style={{ flex:1, textAlign:'left' }}>
                  <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)', marginBottom:2 }}>
                    {cat.shortLabel}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {examCount > 0
                      ? `${examCount} exam${examCount !== 1 ? 's' : ''} · ${attemptCount} attempt${attemptCount !== 1 ? 's' : ''}`
                      : 'No exams yet'}
                  </div>
                </div>
                <span style={{ color:cat.color, fontSize:18, fontWeight:900, flexShrink:0 }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ emoji, label, value, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize:18 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight:800, fontSize:17, color: color || 'var(--text-primary)', lineHeight:1.1 }}>{value}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

const styles = {
  backBtn: {
    background:'none', border:'none', cursor:'pointer',
    color:'var(--teal)', fontWeight:700, fontSize:13,
    padding:0, marginBottom:20, display:'flex', alignItems:'center', gap:6,
  },
  specialtyCard: {
    display:'flex', alignItems:'center', gap:14,
    padding:'16px 18px', borderRadius:14,
    border:'1.5px solid', cursor:'pointer',
    fontFamily:'inherit', transition:'all 0.2s',
    position:'relative', overflow:'hidden',
    background:'var(--bg-card)',
  },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 },
  courseCard: {
    display:'flex', flexDirection:'column', alignItems:'center', gap:8,
    padding:'18px 12px', background:'var(--bg-card)',
    border:'1.5px solid var(--border)', borderRadius:14,
    cursor:'pointer', fontFamily:'inherit', transition:'all 0.18s',
  },
  examRow: {
    display:'flex', alignItems:'center', gap:12,
    padding:'14px 16px', background:'var(--bg-card)',
    border:'1px solid var(--border)', borderRadius:12,
    cursor:'pointer', fontFamily:'inherit', width:'100%',
    transition:'all 0.18s',
  },
  iconBox: {
    width:48, height:48, borderRadius:12, flexShrink:0,
    background:'rgba(13,148,136,0.12)',
    display:'flex', alignItems:'center', justifyContent:'center', fontSize:22,
  },
  statsStrip: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 },
  statCard: {
    background:'var(--bg-card)', border:'1px solid var(--border)',
    borderRadius:12, padding:'10px 16px',
    display:'flex', alignItems:'center', gap:10, flex:'1 1 100px',
  },
  attemptRow: {
    background:'var(--bg-card)', border:'1px solid var(--border)',
    borderRadius:10, padding:'12px 16px',
    display:'flex', flexDirection:'column', gap:4,
  },
  emptyState: { textAlign:'center', padding:'60px 24px', color:'var(--text-muted)', fontSize:14 },
};