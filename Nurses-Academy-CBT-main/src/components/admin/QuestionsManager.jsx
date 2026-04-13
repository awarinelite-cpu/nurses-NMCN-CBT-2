// src/components/admin/QuestionsManager.jsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc,
  query, where, orderBy, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES, ALL_EXAM_TYPES, EXAM_YEARS, DIFFICULTY_LEVELS, DEFAULT_NURSING_COURSES } from '../../data/categories';
import {
  parseQuestionsFromText,
  parseAnswerKey,
  validateQuestion,
  formatQuestionForFirestore,
  shuffleAllQuestionsOptions,
} from '../../utils/questionParser';
import { useToast } from '../shared/Toast';

// ── NEW: Prepend "Question Bank (Unified Pool)" as the FIRST and recommended type ──
// This is the type to use for all new uploads — the question is tagged with
// course + topic, and is automatically available in Course Drill, Topic Drill,
// and Daily Practice without uploading separately for each.
const EXTENDED_EXAM_TYPES = [
  {
    id:    'question_bank',
    label: '⭐ Question Bank (All Drills)',
    hint:  'Tag with Course + Topic. One upload feeds Topic Drill, Course Drill, and Daily Practice automatically.',
  },
  ...ALL_EXAM_TYPES.filter(t => !['topic_drill','course_drill','daily_practice'].includes(t.id)),
  // Keep the old drill types at the bottom for legacy/scheduled exam uploads
  { id: 'topic_drill',    label: 'Topic Drill (Legacy)', hint: '' },
  { id: 'course_drill',   label: 'Course Drill (Legacy)', hint: '' },
  { id: 'daily_practice', label: 'Daily Practice (Legacy)', hint: '' },
];

export default function QuestionsManager() {
  const { toast }    = useToast();
  const [urlParams]  = useSearchParams();
  const defaultTab   = urlParams.get('action') === 'bulk' ? 'bulk_upload'
                     : urlParams.get('action') === 'add'  ? 'add_single' : 'list';

  const [tab,       setTab]       = useState(defaultTab);
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(new Set());

  // Filters
  const [filterCat,  setFilterCat]  = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(0);
  const PAGE_SIZE = 20;

  // Single add form — default to question_bank type
  const BLANK = {
    question: '', options: ['', '', '', ''], correctIndex: 0,
    explanation: '', category: 'general_nursing', examType: 'question_bank',
    year: '2024', subject: '', difficulty: 'medium', source: '', tags: '',
    topic: '', course: '', imageUrl: '', explanationImageUrl: '',
  };
  const [form, setForm] = useState({ ...BLANK });

  // Bulk paste — default to question_bank type
  const [bulkText,   setBulkText]   = useState('');
  const [answerText, setAnswerText] = useState('');
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  const [bulkMeta,   setBulkMeta]   = useState({
    category: 'general_nursing', examType: 'question_bank',
    year: '2024', subject: '', difficulty: 'medium', source: '',
    topic: '', course: '',
  });
  const [parsedQs,  setParsedQs]  = useState([]);
  const [parseErr,  setParseErr]  = useState('');
  const [parseInfo, setParseInfo] = useState('');

  // ── Load courses from Firestore ──────────────────────────────────────────
  const [firestoreCourses, setFirestoreCourses] = useState([]);
  useEffect(() => {
    getDocs(collection(db, 'courses'))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        setFirestoreCourses(all);
      })
      .catch(() => {});
  }, []);

  // ── Load questions ──────────────────────────────────────────────────────
  const loadQuestions = async () => {
    setLoading(true);
    try {
      const constraints = [];
      if (filterCat)  constraints.push(where('category', '==', filterCat));
      if (filterType) constraints.push(where('examType', '==', filterType));
      if (filterYear) constraints.push(where('year',     '==', filterYear));
      constraints.push(orderBy('createdAt', 'desc'));
      const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
      let qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search) qs = qs.filter(q => q.question?.toLowerCase().includes(search.toLowerCase()));
      setQuestions(qs);
      setPage(0);
    } catch (e) { toast('Failed to load: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'list') loadQuestions(); }, [tab, filterCat, filterType, filterYear]);

  // ── Single add ────────────────────────────────────────────────────────────
  const handleSingleAdd = async (e) => {
    e.preventDefault();
    const q = { ...form, options: form.options.filter(o => o.trim()), tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) };
    const errs = validateQuestion(q);
    if (errs.length) { toast(errs[0], 'error'); return; }
    setLoading(true);
    try {
      if (form.id) {
        await updateDoc(doc(db, 'questions', form.id), { ...formatQuestionForFirestore(q, q), updatedAt: serverTimestamp() });
        toast('Question updated!', 'success');
      } else {
        await addDoc(collection(db, 'questions'), { ...formatQuestionForFirestore(q, q), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast('Question saved!', 'success');
      }
      setForm({ ...BLANK });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleParse = () => {
    setParseErr(''); setParseInfo('');
    if (!bulkText.trim()) { setParseErr('Paste questions first.'); return; }

    let parsed = parseQuestionsFromText(bulkText, answerText);
    if (parsed.length === 0) { setParseErr('Could not parse questions. Check the format guide below.'); return; }

    if (shuffleEnabled) {
      parsed = shuffleAllQuestionsOptions(parsed);
    }

    const withAnswer    = parsed.filter(q => q._hasAnswer || q.correctIndex >= 0).length;
    const withoutAnswer = parsed.length - withAnswer;
    setParsedQs(parsed);

    let info = `Parsed ${parsed.length} questions.`;
    if (shuffleEnabled) info += ' 🔀 Options shuffled.';
    if (withoutAnswer > 0) info += ` ⚠️ ${withoutAnswer} have no answer.`;
    setParseInfo(info);
    toast(`${parsed.length} questions parsed!`, 'success');
  };

  // ── Bulk upload ───────────────────────────────────────────────────────────
  const handleBulkUpload = async () => {
    if (parsedQs.length === 0) { toast('Nothing to upload.', 'error'); return; }

    const isQBank = bulkMeta.examType === 'question_bank';

    // Question bank uploads MUST have course. Topic is strongly recommended.
    if (isQBank && !bulkMeta.course) {
      toast('⚠️ Please select a Course for Question Bank uploads.', 'error');
      return;
    }
    if (!isQBank && bulkMeta.examType === 'course_drill' && !bulkMeta.course) {
      toast('⚠️ Please select a Course before uploading course drill questions.', 'error');
      return;
    }
    if (!isQBank && bulkMeta.examType === 'topic_drill' && (!bulkMeta.course || !bulkMeta.topic)) {
      toast('⚠️ Please set both Course and Topic for topic drill questions.', 'error');
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

      let examName = '';
      if (isQBank) {
        const courseObj = firestoreCourses.find(c => c.id === bulkMeta.course);
        const topicPart = bulkMeta.topic ? ` › ${bulkMeta.topic}` : '';
        examName = `${courseObj?.label || bulkMeta.course}${topicPart} — ${dateStr}, ${timeStr}`;
      } else if (bulkMeta.examType === 'course_drill') {
        const courseObj = firestoreCourses.find(c => c.id === bulkMeta.course);
        examName = `${courseObj?.label || bulkMeta.course} — ${dateStr}, ${timeStr}`;
      } else if (bulkMeta.examType === 'topic_drill') {
        const courseObj = firestoreCourses.find(c => c.id === bulkMeta.course);
        examName = `${courseObj?.label || bulkMeta.course} › ${bulkMeta.topic} — ${dateStr}, ${timeStr}`;
      } else {
        const catObj  = NURSING_CATEGORIES.find(c => c.id === bulkMeta.category);
        const typeObj = EXTENDED_EXAM_TYPES.find(t => t.id === bulkMeta.examType);
        examName = `${catObj?.shortLabel || bulkMeta.category} ${typeObj?.label || bulkMeta.examType} — ${dateStr}, ${timeStr}`;
      }

      // Create exam doc (used for admin reference; question_bank exams are not shown to students)
      const examDoc = await addDoc(collection(db, 'exams'), {
        name:           examName,
        examType:       bulkMeta.examType,
        category:       bulkMeta.category    || '',
        course:         bulkMeta.course       || '',
        topic:          bulkMeta.topic        || '',
        subject:        bulkMeta.subject      || '',
        year:           bulkMeta.year         || '2024',
        difficulty:     bulkMeta.difficulty   || 'medium',
        totalQuestions: parsedQs.length,
        // question_bank exams are not browsable by students — they contribute
        // to the shared pool instead. Set a flag so ExamListPage can skip them.
        isPool:         isQBank,
        active:         !isQBank, // legacy exams stay active; pool uploads hidden
        createdAt:      serverTimestamp(),
      });
      const examId = examDoc.id;

      // Upload questions in batches
      const batchSize = 500;
      for (let i = 0; i < parsedQs.length; i += batchSize) {
        const batch = writeBatch(db);
        parsedQs.slice(i, i + batchSize).forEach(q => {
          const ref  = doc(collection(db, 'questions'));
          const data = formatQuestionForFirestore(q, bulkMeta);
          batch.set(ref, {
            ...data,
            examId,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      toast(`✅ "${examName}" — ${parsedQs.length} questions uploaded!`, 'success');
      setParsedQs([]); setBulkText(''); setAnswerText(''); setParseInfo('');
    } catch (e) { toast('Upload failed: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // ── Sync exam question count after deletions ────────────────────────────
  const syncExamQuestionCount = async (examId) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'questions'),
        where('examId', '==', examId),
      ));
      const remaining = snap.size;
      await updateDoc(doc(db, 'exams', examId), {
        totalQuestions: remaining,
        ...(remaining === 0 ? { active: false } : { active: true }),
      });
    } catch (e) {
      console.warn('syncExamQuestionCount failed for', examId, e);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      const qSnap = await getDoc(doc(db, 'questions', id));
      const examId = qSnap.exists() ? qSnap.data().examId : null;
      await deleteDoc(doc(db, 'questions', id));
      setQuestions(prev => prev.filter(q => q.id !== id));
      if (examId) await syncExamQuestionCount(examId);
      toast('Deleted.', 'success');
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const catLabel  = filterCat  ? (NURSING_CATEGORIES.find(c => c.id === filterCat)?.shortLabel  || filterCat)  : 'All Categories';
    const typeLabel = filterType ? (EXTENDED_EXAM_TYPES.find(t => t.id === filterType)?.label      || filterType) : 'All Types';
    const yearLabel = filterYear ? filterYear : 'All Years';
    if (!window.confirm(
      `Delete ${selected.size} selected question(s)?\n\nFilter: ${catLabel} / ${typeLabel} / ${yearLabel}\n\nThis cannot be undone.`
    )) return;
    try {
      const examIds = new Set(
        questions.filter(q => selected.has(q.id) && q.examId).map(q => q.examId)
      );
      const batch = writeBatch(db);
      selected.forEach(id => batch.delete(doc(db, 'questions', id)));
      await batch.commit();
      setQuestions(prev => prev.filter(q => !selected.has(q.id)));
      setSelected(new Set());
      await Promise.all([...examIds].map(syncExamQuestionCount));
      toast(`Deleted.`, 'success');
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  };

  const paged = questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Helper: should we show course/topic fields for the current exam type?
  const showCourseField = (examType) =>
    ['question_bank', 'course_drill', 'topic_drill'].includes(examType);
  const showTopicField = (examType) =>
    ['question_bank', 'topic_drill'].includes(examType);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 20px', color: 'var(--text-primary)' }}>
        ❓ Questions Manager
      </h2>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {[
          ['list',        '📋 All Questions'],
          ['add_single',  '➕ Add Single'],
          ['bulk_upload', '📤 Bulk Upload'],
        ].map(([id, label]) => (
          <button key={id} style={{
            ...styles.tabBtn,
            background: tab === id ? 'var(--teal)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--text-secondary)',
          }} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <div>
          <div style={styles.filterBar}>
            <select className="form-input" style={{ height:38, width:180 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">All Categories</option>
              {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.shortLabel}</option>)}
            </select>
            <select className="form-input" style={{ height:38, width:210 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {EXTENDED_EXAM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select className="form-input" style={{ height:38, width:120 }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="">All Years</option>
              {EXAM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <input className="form-input" style={{ height:38, width:220 }} placeholder="🔍 Search…" value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn btn-secondary btn-sm" onClick={loadQuestions}>↻ Refresh</button>
            {selected.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={deleteSelected}>🗑️ Delete {selected.size}</button>
            )}
          </div>

          {loading ? <div className="flex-center" style={{ padding:40 }}><div className="spinner"/></div> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(questions.map(q=>q.id)) : new Set())} /></th>
                      <th>TYPE</th><th>COURSE</th><th>TOPIC</th><th>CATEGORY</th><th>CREATED</th><th>D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(q => (
                      <tr key={q.id}>
                        <td><input type="checkbox" checked={selected.has(q.id)} onChange={e => {
                          const s = new Set(selected);
                          e.target.checked ? s.add(q.id) : s.delete(q.id);
                          setSelected(s);
                        }}/></td>
                        <td>
                          <span className={`badge ${q.examType === 'question_bank' ? 'badge-teal' : 'badge-grey'}`}>
                            {q.examType === 'question_bank' ? '⭐ Pool' : q.examType}
                          </span>
                        </td>
                        <td style={{ fontSize:12 }}>{firestoreCourses.find(c=>c.id===q.course)?.label || q.course || '—'}</td>
                        <td style={{ fontSize:12 }}>{q.topic || '—'}</td>
                        <td>{NURSING_CATEGORIES.find(c=>c.id===q.category)?.icon} {NURSING_CATEGORIES.find(c=>c.id===q.category)?.shortLabel || q.category}</td>
                        <td style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                          {q.createdAt?.toDate
                            ? q.createdAt.toDate().toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' }) + ' ' +
                              q.createdAt.toDate().toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' })
                            : '—'}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setForm({...q, tags: (q.tags||[]).join(',')}); setTab('add_single'); }}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q.id)}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:12, alignItems:'center' }}>
                <button className="btn btn-ghost btn-sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Prev</button>
                <span style={{ fontSize:13, color:'var(--text-muted)' }}>Page {page+1} of {Math.max(1,Math.ceil(questions.length/PAGE_SIZE))} ({questions.length} total)</span>
                <button className="btn btn-ghost btn-sm" disabled={(page+1)*PAGE_SIZE>=questions.length} onClick={()=>setPage(p=>p+1)}>Next →</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADD SINGLE TAB ── */}
      {tab === 'add_single' && (
        <form onSubmit={handleSingleAdd} style={{ maxWidth:700 }}>
          <div style={styles.metaGrid}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {NURSING_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.shortLabel}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Exam Type</label>
              <select className="form-input" value={form.examType} onChange={e=>setForm(f=>({...f,examType:e.target.value,course:'',topic:''}))}>
                {EXTENDED_EXAM_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            {/* Question Bank banner */}
            {form.examType === 'question_bank' && (
              <div style={{
                gridColumn: '1/-1',
                background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.35)',
                borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)',
              }}>
                ⭐ <strong>Question Bank</strong> — set <strong>Course</strong> and <strong>Topic</strong> below.
                This question will automatically appear in <strong>Course Drill</strong>, <strong>Topic Drill</strong>, and <strong>Daily Practice</strong>.
                No separate uploads needed.
              </div>
            )}

            {showCourseField(form.examType) && (
              <div className="form-group">
                <label className="form-label">Course {form.examType === 'question_bank' ? '*' : '* (required)'}</label>
                <select className="form-input" value={form.course} onChange={e=>setForm(f=>({...f,course:e.target.value}))}>
                  <option value="">— Select Course —</option>
                  {firestoreCourses.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            )}
            {showTopicField(form.examType) && (
              <div className="form-group">
                <label className="form-label">Topic {form.examType === 'topic_drill' ? '* (required)' : '(recommended)'}</label>
                <input className="form-input" placeholder="e.g. Fluid & Electrolytes" value={form.topic} onChange={e=>setForm(f=>({...f,topic:e.target.value}))} />
              </div>
            )}

            {form.examType !== 'course_drill' && form.examType !== 'topic_drill' && form.examType !== 'question_bank' && (
              <div className="form-group">
                <label className="form-label">Year</label>
                <select className="form-input" value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))}>
                  {EXAM_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <select className="form-input" value={form.difficulty} onChange={e=>setForm(f=>({...f,difficulty:e.target.value}))}>
                {DIFFICULTY_LEVELS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop:16 }}>
            <label className="form-label">Question *</label>
            <textarea className="form-input" rows={3} value={form.question} onChange={e=>setForm(f=>({...f,question:e.target.value}))} />
          </div>

          {form.options.map((opt, i) => (
            <div key={i} className="form-group">
              <label className="form-label" style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" name="correct" checked={form.correctIndex===i} onChange={()=>setForm(f=>({...f,correctIndex:i}))} />
                Option {String.fromCharCode(65+i)} {form.correctIndex===i && <span style={{color:'var(--green)',fontSize:12}}>✓ Correct</span>}
              </label>
              <input className="form-input" value={opt} onChange={e=>{
                const opts=[...form.options]; opts[i]=e.target.value; setForm(f=>({...f,options:opts}));
              }} />
            </div>
          ))}

          <div className="form-group">
            <label className="form-label">Explanation (optional)</label>
            <textarea className="form-input" rows={2} value={form.explanation} onChange={e=>setForm(f=>({...f,explanation:e.target.value}))} />
          </div>

          <div className="form-group">
            <label className="form-label">📷 Question Image URL (optional)</label>
            <input className="form-input" placeholder="Paste image URL…"
              value={form.imageUrl} onChange={e=>setForm(f=>({...f,imageUrl:e.target.value}))} />
            {form.imageUrl && (
              <div style={{ marginTop:8, position:'relative', display:'inline-block' }}>
                <img src={form.imageUrl} alt="Question" style={{ maxWidth:260, maxHeight:160, borderRadius:8, border:'1px solid var(--border)' }} />
                <button type="button" onClick={() => setForm(f=>({...f,imageUrl:''}))}
                  style={{ position:'absolute', top:4, right:4, background:'rgba(239,68,68,0.85)', border:'none', borderRadius:'50%', width:22, height:22, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:900 }}>×</button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">🖼️ Explanation Image URL (optional)</label>
            <input className="form-input" placeholder="Paste image URL for explanation diagram…"
              value={form.explanationImageUrl} onChange={e=>setForm(f=>({...f,explanationImageUrl:e.target.value}))} />
            {form.explanationImageUrl && (
              <div style={{ marginTop:8, position:'relative', display:'inline-block' }}>
                <img src={form.explanationImageUrl} alt="Explanation" style={{ maxWidth:260, maxHeight:160, borderRadius:8, border:'1px solid var(--border)' }} />
                <button type="button" onClick={() => setForm(f=>({...f,explanationImageUrl:''}))}
                  style={{ position:'absolute', top:4, right:4, background:'rgba(239,68,68,0.85)', border:'none', borderRadius:'50%', width:22, height:22, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:900 }}>×</button>
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:10, marginTop:16 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? <><span className="spinner spinner-sm"/> Saving…</> : form.id ? '💾 Update' : '➕ Add Question'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={()=>setForm({...BLANK})}>Clear</button>
          </div>
        </form>
      )}

      {/* ── BULK UPLOAD TAB ── */}
      {tab === 'bulk_upload' && (
        <div>
          {/* Meta fields */}
          <div style={{ ...styles.metaGrid, marginBottom:20, padding:'16px 18px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12 }}>
            <div style={{ gridColumn:'1/-1', fontWeight:700, fontSize:14, color:'var(--teal)', marginBottom:4 }}>
              📋 Exam Metadata — set these BEFORE uploading
            </div>

            <div className="form-group">
              <label className="form-label">Exam Type *</label>
              <select className="form-input" value={bulkMeta.examType} onChange={e=>setBulkMeta(m=>({...m,examType:e.target.value,course:'',topic:''}))}>
                {EXTENDED_EXAM_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-input" value={bulkMeta.category} onChange={e=>setBulkMeta(m=>({...m,category:e.target.value}))}>
                {NURSING_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.shortLabel}</option>)}
              </select>
            </div>

            {/* Question Bank banner */}
            {bulkMeta.examType === 'question_bank' && (
              <div style={{
                gridColumn: '1/-1',
                background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.35)',
                borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)',
              }}>
                ⭐ <strong>Question Bank (Unified Pool)</strong> — upload once, used everywhere.
                Tag questions with <strong>Course + Topic</strong> below.
                They will automatically feed <strong>Course Drill</strong> (by course), <strong>Topic Drill</strong> (by topic),
                and <strong>Daily Practice</strong> (random mix of everything).
                No need to re-upload for each drill type.
              </div>
            )}

            {showCourseField(bulkMeta.examType) && (
              <div className="form-group">
                <label className="form-label" style={{ color:'var(--gold)' }}>Course * (required)</label>
                <select className="form-input" value={bulkMeta.course} onChange={e=>setBulkMeta(m=>({...m,course:e.target.value}))}>
                  <option value="">— Select Course —</option>
                  {firestoreCourses.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            )}
            {showTopicField(bulkMeta.examType) && (
              <div className="form-group">
                <label className="form-label" style={{ color: bulkMeta.examType === 'topic_drill' ? 'var(--gold)' : 'var(--text-secondary)' }}>
                  Topic {bulkMeta.examType === 'topic_drill' ? '* (required)' : '(recommended)'}
                </label>
                <input className="form-input" placeholder="e.g. Fluid & Electrolytes" value={bulkMeta.topic} onChange={e=>setBulkMeta(m=>({...m,topic:e.target.value}))} />
              </div>
            )}

            {bulkMeta.examType !== 'course_drill' && bulkMeta.examType !== 'topic_drill' && bulkMeta.examType !== 'question_bank' && (
              <div className="form-group">
                <label className="form-label">Year</label>
                <select className="form-input" value={bulkMeta.year} onChange={e=>setBulkMeta(m=>({...m,year:e.target.value}))}>
                  {EXAM_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <select className="form-input" value={bulkMeta.difficulty} onChange={e=>setBulkMeta(m=>({...m,difficulty:e.target.value}))}>
                {DIFFICULTY_LEVELS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            {bulkMeta.examType !== 'course_drill' && bulkMeta.examType !== 'topic_drill'
            && bulkMeta.examType !== 'daily_practice' && bulkMeta.examType !== 'question_bank' && (
              <div className="form-group">
                <label className="form-label">Subject / Source</label>
                <input className="form-input" placeholder="Optional" value={bulkMeta.subject} onChange={e=>setBulkMeta(m=>({...m,subject:e.target.value}))} />
              </div>
            )}

            {/* Exam name preview */}
            <div style={{ gridColumn:'1/-1', marginTop:4 }}>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>📌 Batch will be named: </span>
              <span style={{ fontSize:12, color:'var(--teal)', fontWeight:700 }}>
                {(() => {
                  const now = new Date();
                  const dateStr = now.toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' });
                  const timeStr = now.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' });
                  if (bulkMeta.examType === 'question_bank') {
                    const c = firestoreCourses.find(c=>c.id===bulkMeta.course);
                    const topicPart = bulkMeta.topic ? ` › ${bulkMeta.topic}` : '';
                    return `${c?.label || '(select course)'}${topicPart} — ${dateStr}, ${timeStr}`;
                  } else if (bulkMeta.examType === 'course_drill') {
                    const c = firestoreCourses.find(c=>c.id===bulkMeta.course);
                    return `${c?.label || '(select course)'} — ${dateStr}, ${timeStr}`;
                  } else if (bulkMeta.examType === 'topic_drill') {
                    const c = firestoreCourses.find(c=>c.id===bulkMeta.course);
                    return `${c?.label || '(select course)'} › ${bulkMeta.topic || '(enter topic)'} — ${dateStr}, ${timeStr}`;
                  } else {
                    const c = NURSING_CATEGORIES.find(c=>c.id===bulkMeta.category);
                    const t = EXTENDED_EXAM_TYPES.find(t=>t.id===bulkMeta.examType);
                    return `${c?.shortLabel || ''} ${t?.label || ''} — ${dateStr}, ${timeStr}`;
                  }
                })()}
              </span>
            </div>
          </div>

          {/* Shuffle toggle */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:4 }}>
              <div onClick={()=>setShuffleEnabled(v=>!v)} style={{
                width:44, height:24, borderRadius:12, position:'relative', cursor:'pointer',
                background: shuffleEnabled ? 'var(--teal)' : 'var(--bg-tertiary)',
                border:'1px solid var(--border)', transition:'background 0.2s',
              }}>
                <div style={{
                  position:'absolute', top:3, left: shuffleEnabled ? 23 : 3,
                  width:18, height:18, borderRadius:'50%', background:'#fff',
                  transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
              <span style={{ fontWeight:600, fontSize:14 }}>🔀 Shuffle answer positions</span>
            </label>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {shuffleEnabled ? 'ON — correct answers will be spread across A, B, C, D randomly' : 'OFF — options stay in original order'}
            </span>
          </div>

          {/* Format guide */}
          <div className="alert alert-info" style={{ marginBottom:16, fontSize:12 }}>
            <strong>📋 Accepted formats:</strong>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginTop:10 }}>
              {[
                ['Standard (answer inline)', '1. Question?\nA. Option  B. Option  C. Option  D. Option\nAnswer: C'],
                ['Options on separate lines', '1. Question?\nA) Option one\nB) Option two\nC) Option three\nD) Option four\nANS: B'],
                ['Short 2-per-line options', '1. Question?\nA. Sympathy   C. Socialism\nB. Criticism  D. Empathy\nAnswer: D'],
                ['Separate answer key box', 'Paste questions above with NO answers,\nthen paste answer key below:\n1. C\n2. A\n3. D\n4. B'],
              ].map(([title, example]) => (
                <div key={title} style={{ background:'var(--bg-tertiary)', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontWeight:700, marginBottom:6, color:'var(--teal)', fontSize:12 }}>{title}</div>
                  <pre style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-secondary)', margin:0, whiteSpace:'pre-wrap' }}>{example}</pre>
                </div>
              ))}
            </div>
          </div>

          {/* Textareas */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize:14, fontWeight:700 }}>
                📝 Questions <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12, marginLeft:6 }}>(paste all questions here)</span>
              </label>
              <textarea className="form-input" rows={16}
                placeholder={"1. What is the normal adult heart rate?\nA. 40-60 bpm\nB. 60-100 bpm\nC. 100-120 bpm\nD. 120-160 bpm\nAnswer: B"}
                value={bulkText}
                onChange={e => { setBulkText(e.target.value); setParsedQs([]); setParseInfo(''); }}
                style={{ fontFamily:'monospace', fontSize:12, resize:'vertical', minHeight:260 }}
              />
              <div className="form-hint">{bulkText ? `~${bulkText.split('\n').filter(l=>l.trim()).length} lines` : 'Supports 1000+ questions at once'}</div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize:14, fontWeight:700 }}>
                🔑 Answer Key <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12, marginLeft:6 }}>(optional)</span>
              </label>
              <textarea className="form-input" rows={16}
                placeholder={"1. B\n2. C\n3. A\n4. D\n5. B"}
                value={answerText}
                onChange={e => { setAnswerText(e.target.value); setParsedQs([]); setParseInfo(''); }}
                style={{ fontFamily:'monospace', fontSize:12, resize:'vertical', minHeight:260 }}
              />
              <div className="form-hint">
                {answerText ? `${Object.keys(parseAnswerKey(answerText)).length} answers detected` : 'Leave blank if answers are inside question text'}
              </div>
            </div>
          </div>

          {parseErr  && <div className="alert alert-error"  style={{ marginBottom:12 }}>⚠️ {parseErr}</div>}
          {parseInfo && <div className="alert alert-info"   style={{ marginBottom:12 }}>ℹ️ {parseInfo}</div>}

          <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
            <button className="btn btn-secondary" onClick={handleParse} disabled={!bulkText.trim()}>
              🔍 Parse Questions
            </button>
            {parsedQs.length > 0 && (
              <button className="btn btn-primary" onClick={handleBulkUpload} disabled={loading}>
                {loading ? <><span className="spinner spinner-sm" /> Uploading…</> : `✅ Upload ${parsedQs.length} Questions`}
              </button>
            )}
            {(bulkText || answerText || parsedQs.length > 0) && (
              <button className="btn btn-ghost" onClick={() => { setParsedQs([]); setBulkText(''); setAnswerText(''); setParseInfo(''); setParseErr(''); }}>
                🗑️ Clear All
              </button>
            )}
          </div>

          {/* Parsed preview */}
          {parsedQs.length > 0 && (
            <div>
              <div style={{ fontWeight:700, marginBottom:12, color:'var(--teal)', fontSize:15 }}>
                ✅ {parsedQs.length} questions ready — review before uploading:
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:600, overflowY:'auto', paddingRight:4 }}>
                {parsedQs.map((q, i) => (
                  <div key={i} style={{
                    ...styles.parsedCard,
                    borderLeft: `4px solid ${q._hasAnswer || q.correctIndex >= 0 ? 'var(--green)' : 'var(--gold)'}`,
                  }}>
                    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                      <span style={{ fontWeight:700, color:'var(--teal)', flexShrink:0, fontSize:13 }}>Q{i+1}.</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:8 }}>{q.question}</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          {q.options.map((opt, j) => (
                            <div key={j} style={{
                              fontSize:13, padding:'4px 10px', borderRadius:6,
                              background: j===q.correctIndex ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
                              color: j===q.correctIndex ? 'var(--green)' : 'var(--text-secondary)',
                              fontWeight: j===q.correctIndex ? 700 : 400,
                              border: `1px solid ${j===q.correctIndex ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
                            }}>
                              {String.fromCharCode(65+j)}. {typeof opt === 'string' ? opt : opt.text} {j===q.correctIndex && '✓'}
                            </div>
                          ))}
                        </div>
                        {q.explanation && (
                          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:6, fontStyle:'italic' }}>💡 {q.explanation}</div>
                        )}
                      </div>
                      <button className="btn btn-danger btn-sm" style={{ flexShrink:0 }}
                        onClick={() => setParsedQs(prev => prev.filter((_,j)=>j!==i))}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

const styles = {
  tabBar: { display:'flex', gap:4, background:'var(--bg-tertiary)', border:'1px solid var(--border)', borderRadius:12, padding:4, marginBottom:24, width:'fit-content' },
  tabBtn: { padding:'8px 18px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700, transition:'all 0.2s' },
  filterBar: { display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' },
  metaGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14 },
  parsedCard: { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' },
};
