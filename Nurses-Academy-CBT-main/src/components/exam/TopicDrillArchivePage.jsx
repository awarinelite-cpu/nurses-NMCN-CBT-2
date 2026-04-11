// src/components/exam/TopicDrillArchivePage.jsx
// Route: /topic-drill-archive
//
// Level 1 — grid of all courses
// Level 2 — click course → list of topics with published exams
// Level 3 — click topic → all published exams for that topic
// Level 4 — click exam → student's attempts + Start/Retake button

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_NURSING_COURSES } from '../../data/categories';

export default function TopicDrillArchivePage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [allCourses,     setAllCourses]     = useState([]);
  const [publishedExams, setPublishedExams] = useState([]);
  const [sessions,       setSessions]       = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedTopic,  setSelectedTopic]  = useState(null);
  const [selectedExam,   setSelectedExam]   = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const snap   = await getDocs(collection(db, 'courses'));
        const custom = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const merged = [...DEFAULT_NURSING_COURSES];
        custom.forEach(c => { if (!merged.find(m => m.id === c.id)) merged.push(c); });
        setAllCourses(merged);
      } catch { setAllCourses(DEFAULT_NURSING_COURSES); }
    };
    loadCourses();
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const [examSnap, sessSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'exams'),
            where('examType', '==', 'topic_drill')
          )),
          getDocs(query(
            collection(db, 'examSessions'),
            where('userId',   '==', user.uid),
            where('examType', '==', 'topic_drill'),
          )),
        ]);
        setPublishedExams(
            examSnap.docs.map(d => ({ id: d.id, ...d.data() }))
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
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  const sessionsByExam = {};
  sessions.forEach(s => {
    const key = s.examId || 'unknown';
    if (!sessionsByExam[key]) sessionsByExam[key] = [];
    sessionsByExam[key].push(s);
  });

  const handleStartExam = (exam) => {
    const courseObj = DEFAULT_NURSING_COURSES.find(c => c.id === exam.course);
    const p = new URLSearchParams({
      examType:    'topic_drill',
      examId:      exam.id,
      examName:    exam.name,
      course:      exam.course,
      courseLabel: courseObj?.label || exam.course,
      topic:       exam.topic,
      count:       exam.totalQuestions || 20,
      timeLimit:   30,
      shuffle:     'false',
      showExpl:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  // ── Level 4: Exam attempts ─────────────────────────────────────
  if (selectedCourse && selectedTopic && selectedExam) {
    const attempts = sessionsByExam[selectedExam.id] || [];
    const best = attempts.length > 0 ? Math.max(...attempts.map(s => s.scorePercent || 0)) : null;
    const avg  = attempts.length > 0
      ? Math.round(attempts.reduce((a, s) => a + (s.scorePercent || 0), 0) / attempts.length)
      : null;

    return (
      <div style={{ padding:'24px', maxWidth:900 }}>
        <button onClick={() => setSelectedExam(null)} style={styles.backBtn}>
          ← Back to {selectedTopic} Exams
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <div style={{ ...styles.iconBox, fontSize:28, width:60, height:60, borderRadius:16 }}>🎯</div>
          <div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:2 }}>
              {selectedCourse.icon} {selectedCourse.label} › {selectedTopic}
            </div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", margin:0, color:'var(--text-primary)', fontSize:'1.2rem' }}>
              {selectedExam.name}
            </h2>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{selectedExam.totalQuestions} questions</div>
          </div>
        </div>

        {attempts.length > 0 && (
          <div style={styles.statsStrip}>
            <StatCard emoji="🔁" label="Attempts"   value={attempts.length} />
            <StatCard emoji="🏆" label="Best Score" value={`${best}%`} color={best >= 70 ? 'var(--green)' : best >= 50 ? '#F59E0B' : '#EF4444'} />
            <StatCard emoji="📊" label="Avg Score"  value={`${avg}%`}  color={avg  >= 70 ? 'var(--green)' : avg  >= 50 ? '#F59E0B' : '#EF4444'} />
          </div>
        )}

        <button className="btn btn-primary" style={{ marginBottom:24 }} onClick={() => handleStartExam(selectedExam)}>
          {attempts.length > 0 ? '🔄 Retake Exam' : '▶ Start Exam'}
        </button>

        {attempts.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No attempts yet</div>
            <div style={{ color:'var(--text-muted)', fontSize:14 }}>Start the exam above.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>Your Attempts</div>
            {attempts.map((s, i) => {
              const sc  = s.scorePercent || 0;
              const col = sc >= 70 ? 'var(--green)' : sc >= 50 ? '#F59E0B' : '#EF4444';
              const date = s.completedAt?.toDate
                ? new Date(s.completedAt.toDate()).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
                : 'Recently';
              return (
                <div key={s.id} style={{ ...styles.attemptRow, borderLeft:`4px solid ${col}` }}>
                  <div style={{ fontWeight:700, fontSize:14, color:col }}>#{i+1} — {sc}%</div>
                  <div style={{ fontSize:13, color:'var(--text-muted)' }}>{s.correct}/{s.totalQuestions} correct · {date}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Level 3: Exams for selected topic ─────────────────────────
  if (selectedCourse && selectedTopic) {
    const examsForTopic = publishedExams.filter(e => e.course === selectedCourse.id && e.topic === selectedTopic);

    return (
      <div style={{ padding:'24px', maxWidth:900 }}>
        <button onClick={() => setSelectedTopic(null)} style={styles.backBtn}>
          ← Back to {selectedCourse.label} Topics
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <div style={{ ...styles.iconBox, fontSize:24, width:52, height:52 }}>🎯</div>
          <div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:2 }}>{selectedCourse.icon} {selectedCourse.label}</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", margin:0, color:'var(--text-primary)' }}>{selectedTopic}</h2>
            <p style={{ color:'var(--text-muted)', fontSize:14, margin:'4px 0 0' }}>
              {examsForTopic.length} published exam{examsForTopic.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {examsForTopic.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No exams yet for this topic</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {examsForTopic.map(exam => {
              const attempts  = sessionsByExam[exam.id] || [];
              const best      = attempts.length > 0 ? Math.max(...attempts.map(s => s.scorePercent || 0)) : null;
              const bestColor = best !== null ? (best >= 70 ? 'var(--green)' : best >= 50 ? '#F59E0B' : '#EF4444') : 'var(--text-muted)';
              const uploadDate = exam.createdAt?.toDate
                ? new Date(exam.createdAt.toDate()).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' })
                : '';
              return (
                <button key={exam.id} onClick={() => setSelectedExam(exam)} style={styles.examRow}>
                  <div style={{ ...styles.iconBox, fontSize:18, flexShrink:0 }}>📋</div>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)' }}>{exam.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>
                      {exam.totalQuestions} questions · {uploadDate}
                      {best !== null
                        ? <span style={{ color:bestColor, fontWeight:700, marginLeft:10 }}>Best: {best}% ({attempts.length} attempt{attempts.length !== 1 ? 's' : ''})</span>
                        : <span style={{ marginLeft:10, color:'var(--text-muted)' }}>Not attempted</span>}
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

  // ── Level 2: Topics under selected course ──────────────────────
  if (selectedCourse) {
    const topicsForCourse = [...new Set(
      publishedExams.filter(e => e.course === selectedCourse.id).map(e => e.topic).filter(Boolean)
    )];

    return (
      <div style={{ padding:'24px', maxWidth:900 }}>
        <button onClick={() => setSelectedCourse(null)} style={styles.backBtn}>← Back to Courses</button>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <div style={{ ...styles.iconBox, fontSize:26, width:54, height:54 }}>{selectedCourse.icon || '📖'}</div>
          <div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", margin:0, color:'var(--text-primary)' }}>{selectedCourse.label}</h2>
            <p style={{ color:'var(--text-muted)', fontSize:14, margin:'4px 0 0' }}>
              {topicsForCourse.length} topic{topicsForCourse.length !== 1 ? 's' : ''} with published exams
            </p>
          </div>
        </div>

        {topicsForCourse.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No topic exams yet</div>
            <div style={{ color:'var(--text-muted)', fontSize:14 }}>Admin hasn't uploaded any topic drills for this course yet.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {topicsForCourse.map(topic => {
              const examsUnder = publishedExams.filter(e => e.course === selectedCourse.id && e.topic === topic);
              const examIds    = examsUnder.map(e => e.id);
              const attempts   = sessions.filter(s => examIds.includes(s.examId));
              const best       = attempts.length > 0 ? Math.max(...attempts.map(s => s.scorePercent || 0)) : null;
              const bestColor  = best !== null ? (best >= 70 ? 'var(--green)' : best >= 50 ? '#F59E0B' : '#EF4444') : 'var(--text-muted)';
              return (
                <button key={topic} onClick={() => setSelectedTopic(topic)} style={styles.topicRow}>
                  <div style={styles.iconBox}>🎯</div>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)' }}>{topic}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                      {examsUnder.length} exam{examsUnder.length !== 1 ? 's' : ''}
                      {best !== null && <span style={{ color:bestColor, fontWeight:700, marginLeft:8 }}>· Best: {best}%</span>}
                    </div>
                  </div>
                  <span style={{ color:'var(--teal)', fontSize:18 }}>→</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Level 1: Courses grid ──────────────────────────────────────
  const filteredCourses = allCourses.filter(c =>
    !search || c.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding:'24px', maxWidth:900 }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          <span style={{ fontSize:32 }}>🎯</span>
          <h2 style={{ fontFamily:"'Playfair Display',serif", margin:0, color:'var(--text-primary)' }}>Topic Drill Archive</h2>
        </div>
        <p style={{ color:'var(--text-muted)', fontSize:14, margin:0 }}>Select a course to browse topics and published exams.</p>
      </div>

      <input className="form-input" style={{ width:'100%', maxWidth:320, marginBottom:20, height:40 }}
        placeholder="🔍 Search courses…" value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading…</div>
      ) : (
        <div style={styles.grid}>
          {filteredCourses.map(course => {
            const topicsCount = [...new Set(publishedExams.filter(e => e.course === course.id).map(e => e.topic).filter(Boolean))].length;
            return (
              <button key={course.id} onClick={() => setSelectedCourse(course)} style={styles.courseCard}>
                <div style={{ ...styles.iconBox, fontSize:22, width:46, height:46, borderRadius:11 }}>{course.icon || '📖'}</div>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--text-primary)', textAlign:'center', lineHeight:1.3 }}>{course.label}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4, textAlign:'center' }}>
                  {topicsCount > 0 ? `${topicsCount} topic${topicsCount !== 1 ? 's' : ''}` : 'No exams yet'}
                </div>
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
  backBtn: { background:'none', border:'none', cursor:'pointer', color:'var(--teal)', fontWeight:700, fontSize:13, padding:0, marginBottom:20, display:'flex', alignItems:'center', gap:6 },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 },
  courseCard: { display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'18px 12px', background:'var(--bg-card)', border:'1.5px solid var(--border)', borderRadius:14, cursor:'pointer', fontFamily:'inherit', transition:'all 0.18s' },
  topicRow: { display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, cursor:'pointer', fontFamily:'inherit', width:'100%', transition:'all 0.18s' },
  examRow: { display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, cursor:'pointer', fontFamily:'inherit', width:'100%', transition:'all 0.18s' },
  iconBox: { width:40, height:40, borderRadius:10, flexShrink:0, background:'rgba(13,148,136,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 },
  statsStrip: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 },
  statCard: { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, flex:'1 1 100px' },
  attemptRow: { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', display:'flex', flexDirection:'column', gap:4 },
  emptyState: { textAlign:'center', padding:'60px 24px', color:'var(--text-muted)', fontSize:14 },
};