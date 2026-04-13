// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider }  from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/shared/Toast';
import { useAuth }       from './context/AuthContext';

import { ProtectedRoute, AdminRoute, GuestRoute } from './components/shared/ProtectedRoute';
import AppLayout      from './components/shared/AppLayout';
import LandingPage    from './components/shared/LandingPage';
import AuthPage       from './components/auth/AuthPage';

// Student pages
import StudentDashboard  from './components/student/StudentDashboard';
import AnalyticsPage     from './components/student/AnalyticsPage';
import BookmarksPage     from './components/student/BookmarksPage';
import SubscriptionPage  from './components/student/SubscriptionPage';

// ── Payment page (Paystack + Manual bank transfer) ──────────────
import PaymentPage       from './components/payment/PaymentPage';

// Exam
import ExamSetup          from './components/exam/ExamSetup';
import ExamSession        from './components/exam/ExamSession';
import ExamReviewPage     from './components/exam/ExamReviewPage';
import CategoryPickerPage from './components/exam/CategoryPickerPage';
import ExamConfigPage     from './components/exam/ExamConfigPage';
import ExamListPage       from './components/exam/ExamListPage';
import ExamSetupPage      from './components/exam/ExamSetupPage';
import DailyPracticePage  from './components/exam/DailyPracticePage';
import MockExamPage       from './components/exam/MockExamPage';
import MockReviewStoragePage from './components/exam/MockReviewStoragePage';
import CourseDrillPage    from './components/exam/CourseDrillPage';
import TopicDrillPage     from './components/exam/TopicDrillPage';
import PastQuestionsPage  from './components/exam/PastQuestionsPage';

// Admin pages
import AdminDashboard        from './components/admin/AdminDashboard';
import QuestionsManager      from './components/admin/QuestionsManager';
import UsersManager          from './components/admin/UsersManager';
import PaymentsManager       from './components/admin/PaymentsManager';
import AccessCodesManager    from './components/admin/AccessCodesManager';
import AnnouncementsManager  from './components/admin/AnnouncementsManager';
import ScheduledExamsManager from './components/admin/ScheduledExamsManager';
import CoursesManager        from './components/admin/CoursesManager';

import './styles/global.css';

// ── Register PWA service worker ──────────────────────────────────
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(console.error);
  });
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<GuestRoute><AuthPage /></GuestRoute>} />

              {/* Full-screen exam pages (no sidebar) */}
              <Route path="/exam/session" element={<ProtectedRoute><ExamSession /></ProtectedRoute>} />
              <Route path="/exam/review"  element={<ProtectedRoute><ExamReviewPage /></ProtectedRoute>} />

              {/* ── Payment page (full-screen, no sidebar) ───────────────── */}
              <Route path="/payment" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />

              {/* Authenticated layout */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard"      element={<StudentDashboard />} />
                <Route path="/exams"          element={<ExamSetup />} />
                <Route path="/past-questions" element={<PastQuestionsPage />} />

                {/* ── Daily Practice ───────────────────────────────────── */}
                <Route path="/daily-practice" element={<DailyPracticePage />} />

                {/* Legacy redirect — keep URL alive, send to new page */}
                <Route path="/daily-reviews"  element={<DailyPracticePage />} />

                {/* ── Drill types ──────────────────────────────────────── */}
                <Route path="/course-drill"   element={<CourseDrillPage />} />
                <Route path="/topic-drill"    element={<TopicDrillPage />} />

                {/* ── Shared exam list + setup ─────────────────────────── */}
                <Route path="/exam/list"      element={<ExamListPage />} />
                <Route path="/exam/setup"     element={<ExamSetupPage />} />

                {/* ── Mock exams ───────────────────────────────────────── */}
                <Route path="/mock-exams"     element={<MockExamPage />} />
                <Route path="/mock-reviews"   element={<MockReviewStoragePage />} />

                {/* ── Analytics / bookmarks / subscription ─────────────── */}
                <Route path="/results"      element={<AnalyticsPage />} />
                <Route path="/bookmarks"    element={<BookmarksPage />} />
                <Route path="/subscription" element={<SubscriptionPage />} />
                <Route path="/leaderboard"  element={<LeaderboardPage />} />
                <Route path="/profile"      element={<ProfilePage />} />

                {/* Quick action flow (for other exam types) */}
                <Route path="/exam/categories" element={<CategoryPickerPage />} />
                <Route path="/exam/config"     element={<ExamConfigPage />} />

                {/* Admin */}
                <Route path="/admin"                 element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/questions"       element={<AdminRoute><QuestionsManager /></AdminRoute>} />
                <Route path="/admin/users"           element={<AdminRoute><UsersManager /></AdminRoute>} />
                <Route path="/admin/payments"        element={<AdminRoute><PaymentsManager /></AdminRoute>} />
                <Route path="/admin/access-codes"    element={<AdminRoute><AccessCodesManager /></AdminRoute>} />
                <Route path="/admin/announcements"   element={<AdminRoute><AnnouncementsManager /></AdminRoute>} />
                <Route path="/admin/analytics"       element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                <Route path="/admin/scheduled-exams" element={<AdminRoute><ScheduledExamsManager /></AdminRoute>} />
                <Route path="/admin/courses"         element={<AdminRoute><CoursesManager /></AdminRoute>} />
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// ── Inline simple pages ──────────────────────────────────────────

function LeaderboardPage() {
  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif" }}>🏆 Leaderboard</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Top performers coming soon — take more exams to rank!
      </p>
    </div>
  );
}

function ProfilePage() {
  const { user, profile } = useAuth();
  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", marginBottom: 24 }}>👤 My Profile</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 26, color: '#fff',
          }}>
            {(profile?.name || user?.displayName || 'S')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {profile?.name || user?.displayName || 'Student'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{user?.email}</div>
            <span className={`badge ${profile?.subscribed ? 'badge-teal' : 'badge-grey'}`} style={{ marginTop: 4, display: 'inline-flex' }}>
              {profile?.subscribed ? '⭐ Premium' : '🆓 Free'}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Total Exams',  profile?.totalExams || 0],
            ['Avg Score',    profile?.totalExams ? Math.round((profile?.totalScore || 0) / profile.totalExams) + '%' : '—'],
            ['Plan',         profile?.subscriptionPlan || 'Free'],
            ['Expires',      profile?.subscriptionExpiry ? new Date(profile.subscriptionExpiry).toLocaleDateString() : 'N/A'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminAnalytics() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif" }}>📈 Platform Analytics</h2>
      <p style={{ color: 'var(--text-muted)' }}>Advanced analytics dashboard — coming in next release.</p>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
      textAlign: 'center', padding: 24,
      background: '#020B18', color: '#fff',
    }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '6rem', fontWeight: 900, color: 'rgba(255,255,255,0.07)' }}>
        404
      </div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff' }}>Page Not Found</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)' }}>This page doesn't exist.</p>
      <a href="/" className="btn btn-primary">← Go Home</a>
    </div>
  );
}
