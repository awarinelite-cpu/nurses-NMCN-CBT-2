// src/components/admin/CoursesManager.jsx
//
// Route: /admin/courses
//
// LAYOUT:
//   Level 0 — All specialties as cards (with course count + question count)
//   Level 1 — Click specialty → see its courses
//             Each course shows: question count, active/inactive toggle, edit, delete
//             + Add Course button → inline form
//
// FIRESTORE:
//   Courses → 'courses' collection
//   { label, icon, category, description, active, createdAt, updatedAt }
//
//   active: true  → visible to students in Course Drill
//   active: false → hidden from students (course stays in DB, questions intact)
//
// Admin controls everything. No default/built-in courses. Firestore is the
// single source of truth.

import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, addDoc, deleteDoc, updateDoc,
  doc, setDoc, serverTimestamp, orderBy, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';
import { useToast } from '../shared/Toast';

const ICON_OPTIONS = [
  '📖','📋','🏥','💊','🦴','🫀','🧠','👶','🌍','🔬','🩺','⚖️','🧪','💉',
  '🚨','🔪','🧤','🛏️','❤️','🫘','🎗️','👁️','👂','⚕️','🩹','🔥','🏃',
  '🫁','📊','📢','🌿','🧸','📈','🦺','🏠','🏘️','🤰','🍼','⚠️','😴','🩸',
  '🕊️','🔴','📌','🏋️','🧬','🦷','💆','🧘','🩻','🏨','🎓','⭐',
];

export default function CoursesManager() {
  const { toast } = useToast();

  const [selectedSpecialty, setSelectedSpecialty] = useState(null);
  const [courses,           setCourses]           = useState([]);   // all courses from Firestore
  const [questionCounts,    setQuestionCounts]    = useState({});   // { courseId: count }
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [deletingId,        setDeletingId]        = useState(null);
  const [togglingId,        setTogglingId]        = useState(null);
  const [showAddForm,       setShowAddForm]       = useState(false);
  const [editId,            setEditId]            = useState(null);
  const [search,            setSearch]            = useState('');

  // Add/edit form state
  const [formLabel,      setFormLabel]      = useState('');
  const [formIcon,       setFormIcon]       = useState('📖');
  const [formDesc,       setFormDesc]       = useState('');
  const [formActive,     setFormActive]     = useState(true);
  const [showIconPicker, setShowIconPicker] = useState(false);

  // ── Load all courses from Firestore ───────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'courses'), orderBy('label', 'asc')));
      const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCourses(all);

      // Fetch question counts for all courses in parallel
      const counts = await Promise.all(
        all.map(async c => {
          try {
            const qSnap = await getDocs(query(
              collection(db, 'questions'),
              where('examType', '==', 'course_drill'),
              where('course',   '==', c.id),
              where('active',   '==', true),
            ));
            return [c.id, qSnap.size];
          } catch {
            return [c.id, 0];
          }
        })
      );
      setQuestionCounts(Object.fromEntries(counts));
    } catch (e) {
      console.error('CoursesManager load error:', e);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const coursesForSpecialty = (specialtyId) =>
    courses.filter(c => c.category === specialtyId);

  const resetForm = () => {
    setFormLabel(''); setFormIcon('📖'); setFormDesc(''); setFormActive(true);
    setEditId(null); setShowAddForm(false); setShowIconPicker(false);
  };

  // ── Save (add or edit) ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formLabel.trim()) { toast('Course name is required.', 'error'); return; }
    if (!selectedSpecialty) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, 'courses', editId), {
          label:       formLabel.trim(),
          icon:        formIcon || '📖',
          description: formDesc.trim(),
          active:      formActive,
          updatedAt:   serverTimestamp(),
        });
        toast('Course updated!', 'success');
      } else {
        const slug  = formLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const newId = `${selectedSpecialty.id}_${slug}_${Date.now()}`;
        await setDoc(doc(db, 'courses', newId), {
          label:       formLabel.trim(),
          icon:        formIcon || '📖',
          category:    selectedSpecialty.id,
          description: formDesc.trim(),
          active:      formActive,
          createdAt:   serverTimestamp(),
        });
        toast('Course added!', 'success');
      }
      resetForm();
      await loadData();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleEdit = (course) => {
    setFormLabel(course.label);
    setFormIcon(course.icon || '📖');
    setFormDesc(course.description || '');
    setFormActive(course.active !== false); // default true if field missing
    setEditId(course.id);
    setShowAddForm(true);
    setShowIconPicker(false);
  };

  // ── Toggle active/inactive ────────────────────────────────────────────────
  const handleToggleActive = async (course) => {
    const newActive = course.active === false ? true : false;
    const label     = newActive ? 'visible to students' : 'hidden from students';
    setTogglingId(course.id);
    try {
      await updateDoc(doc(db, 'courses', course.id), {
        active:    newActive,
        updatedAt: serverTimestamp(),
      });
      toast(`"${course.label}" is now ${label}.`, 'success');
      await loadData();
    } catch (e) {
      toast('Toggle failed: ' + e.message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (course) => {
    const qCount = questionCounts[course.id] || 0;
    const warn   = qCount > 0
      ? `\n\n⚠️ This course has ${qCount} question${qCount !== 1 ? 's' : ''} linked to it. Those questions will still exist in the database but won't be reachable from this course.`
      : '';
    if (!window.confirm(`Permanently delete "${course.label}"?${warn}`)) return;
    setDeletingId(course.id);
    try {
      await deleteDoc(doc(db, 'courses', course.id));
      toast(`"${course.label}" deleted.`, 'success');
      await loadData();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LEVEL 1 — Specialty detail view
  // ══════════════════════════════════════════════════════════════════════════
  if (selectedSpecialty) {
    const allCourses   = coursesForSpecialty(selectedSpecialty.id);
    const activeCourses   = allCourses.filter(c => c.active !== false);
    const inactiveCourses = allCourses.filter(c => c.active === false);
    const filtered     = allCourses.filter(c =>
      c.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div style={{ padding: 24, maxWidth: 900 }}>

        {/* Back */}
        <button onClick={() => { setSelectedSpecialty(null); resetForm(); setSearch(''); }} style={styles.backBtn}>
          ← Back to Specialties
        </button>

        {/* Specialty header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
          padding: '16px 20px',
          background: `${selectedSpecialty.color}12`,
          border: `1.5px solid ${selectedSpecialty.color}30`,
          borderRadius: 14,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: `${selectedSpecialty.color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>
            {selectedSpecialty.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              {selectedSpecialty.label}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {activeCourses.length} active · {inactiveCourses.length} inactive
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { resetForm(); setShowAddForm(v => !v); }}
          >
            {showAddForm && !editId ? '✕ Cancel' : '➕ Add Course'}
          </button>
        </div>

        {/* ── Add / Edit form ── */}
        {showAddForm && (
          <div className="card" style={{
            marginBottom: 24, padding: '20px',
            border: `2px solid ${selectedSpecialty.color}40`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
              {editId ? '✏️ Edit Course' : `➕ Add New Course to ${selectedSpecialty.shortLabel}`}
            </div>

            {/* Icon */}
            <div style={{ marginBottom: 14 }}>
              <div style={styles.formLabel}>Course Icon</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowIconPicker(v => !v)}
                  style={{
                    fontSize: 26, background: 'var(--bg-tertiary)',
                    border: '2px solid var(--border)', borderRadius: 10,
                    padding: '8px 14px', cursor: 'pointer',
                  }}
                >{formIcon}</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {showIconPicker ? 'Click an icon to select' : 'Click to change icon'}
                </span>
              </div>
              {showIconPicker && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10,
                  background: 'var(--bg-secondary)', borderRadius: 10, padding: 12,
                  maxWidth: 400,
                }}>
                  {ICON_OPTIONS.map(ico => (
                    <button key={ico}
                      onClick={() => { setFormIcon(ico); setShowIconPicker(false); }}
                      style={{
                        fontSize: 22, cursor: 'pointer',
                        background: formIcon === ico ? 'var(--teal)' : 'var(--bg-card)',
                        border: `2px solid ${formIcon === ico ? 'var(--teal)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '5px 8px',
                      }}
                    >{ico}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Course name */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Course Name *</label>
              <input
                className="form-input"
                style={{ maxWidth: 400 }}
                placeholder="e.g. Advanced Wound Management"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>

            {/* Description */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Description (optional)</label>
              <input
                className="form-input"
                style={{ maxWidth: 400 }}
                placeholder="Brief description…"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
              />
            </div>

            {/* Active toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              maxWidth: 400, background: 'var(--bg-secondary)', borderRadius: 10,
              padding: '12px 16px', marginBottom: 18,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Visible to Students
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {formActive ? 'Students can see and drill this course' : 'Hidden — students cannot see this course'}
                </div>
              </div>
              <button onClick={() => setFormActive(v => !v)} style={{
                width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: formActive ? 'var(--teal)' : 'var(--border)',
                position: 'relative', transition: 'background 0.25s', flexShrink: 0,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: formActive ? 23 : 3,
                  transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {/* Preview */}
            {formLabel.trim() && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: `${selectedSpecialty.color}10`,
                border: `1.5px solid ${selectedSpecialty.color}30`,
                borderRadius: 12, padding: '10px 16px', marginBottom: 16,
              }}>
                <span style={{ fontSize: 22 }}>{formIcon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{formLabel}</div>
                  <div style={{ fontSize: 11, color: selectedSpecialty.color, fontWeight: 600 }}>
                    {selectedSpecialty.shortLabel} · {formActive ? '🟢 Active' : '🔴 Inactive'}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formLabel.trim()}>
                {saving
                  ? <><span className="spinner spinner-sm" /> Saving…</>
                  : editId ? '💾 Update Course' : '✅ Save Course'
                }
              </button>
              <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>
            </div>
          </div>
        )}

        {/* Search */}
        {allCourses.length > 4 && (
          <input className="form-input"
            style={{ maxWidth: 300, marginBottom: 16, height: 40 }}
            placeholder="🔍 Search courses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {/* Course list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {search ? `No courses match "${search}"` : 'No courses yet'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Click "+ Add Course" above to add the first course for this specialty.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(course => {
              const isActive = course.active !== false;
              const qCount   = questionCounts[course.id] || 0;
              return (
                <div key={course.id} style={{
                  ...styles.courseRow,
                  borderLeft: `4px solid ${isActive ? selectedSpecialty.color : 'var(--border)'}`,
                  opacity: isActive ? 1 : 0.65,
                }}>
                  <div style={{ ...styles.courseIcon, background: `${selectedSpecialty.color}18` }}>
                    {course.icon || '📖'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {course.label}
                      </span>
                      {/* Active/Inactive badge */}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: isActive ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.1)',
                        color:      isActive ? '#16A34A'               : '#EF4444',
                        border: `1px solid ${isActive ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}>
                        {isActive ? '🟢 Active' : '🔴 Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                      {/* Question count */}
                      <span style={{
                        fontSize: 11, color: qCount > 0 ? selectedSpecialty.color : 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {qCount > 0 ? `${qCount} question${qCount !== 1 ? 's' : ''}` : 'No questions yet'}
                      </span>
                      {course.description && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {course.description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    {/* Active toggle button */}
                    <button
                      className={`btn btn-sm ${isActive ? 'btn-ghost' : 'btn-primary'}`}
                      disabled={togglingId === course.id}
                      onClick={() => handleToggleActive(course)}
                      style={{ minWidth: 80, fontSize: 11 }}
                    >
                      {togglingId === course.id
                        ? <span className="spinner spinner-sm" />
                        : isActive ? '🙈 Deactivate' : '✅ Activate'
                      }
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleEdit(course)}
                    >✏️</button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={deletingId === course.id}
                      onClick={() => handleDelete(course)}
                      style={{ minWidth: 36 }}
                    >
                      {deletingId === course.id
                        ? <span className="spinner spinner-sm" />
                        : '🗑️'
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEVEL 0 — Specialty overview grid
  // ══════════════════════════════════════════════════════════════════════════
  const totalCourses = courses.length;
  const totalActive  = courses.filter(c => c.active !== false).length;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
          📖 Manage Courses
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '6px 0 0' }}>
          Courses appear in Course Drill for students.
          {!loading && ` ${totalActive} active · ${totalCourses - totalActive} inactive · ${totalCourses} total.`}
        </p>
      </div>

      {/* Info box */}
      <div style={{
        background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 28,
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        💡 <strong>How it works:</strong> Click a specialty to manage its courses.
        Add courses, set them active or inactive, and see how many questions each course has.
        Only <strong>active</strong> courses are visible to students.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {NURSING_CATEGORIES.map(cat => {
            const catCourses    = coursesForSpecialty(cat.id);
            const activeCount   = catCourses.filter(c => c.active !== false).length;
            const inactiveCount = catCourses.filter(c => c.active === false).length;
            const totalQs       = catCourses.reduce((sum, c) => sum + (questionCounts[c.id] || 0), 0);

            return (
              <button
                key={cat.id}
                onClick={() => { setSelectedSpecialty(cat); setSearch(''); resetForm(); }}
                style={{
                  ...styles.specialtyCard,
                  borderColor: `${cat.color}60`,
                  background:  `${cat.color}0D`,
                }}
              >
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px', background: cat.color }} />
                <div style={{ ...styles.specialtyIcon, background: `${cat.color}20` }}>
                  <span style={{ fontSize: 24 }}>{cat.icon}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                    {cat.shortLabel}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {activeCount > 0
                      ? <span style={{ color: cat.color }}>{activeCount} active</span>
                      : <span>0 active</span>
                    }
                    {inactiveCount > 0 && <span style={{ color: '#EF4444' }}> · {inactiveCount} inactive</span>}
                    {totalQs > 0 && <span> · {totalQs} questions</span>}
                    {catCourses.length === 0 && <span> · No courses yet</span>}
                  </div>
                </div>
                <span style={{ color: cat.color, fontSize: 18, fontWeight: 900, flexShrink: 0 }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  specialtyCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '16px 18px', borderRadius: 14,
    border: '1.5px solid', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
    position: 'relative', overflow: 'hidden',
    background: 'var(--bg-card)',
  },
  specialtyIcon: {
    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  courseRow: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  courseIcon: {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
    background: 'rgba(13,148,136,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
  },
  formLabel: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8,
  },
  emptyState: { textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: 14 },
};
