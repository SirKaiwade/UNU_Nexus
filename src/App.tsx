import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';

// Route-level code splitting — each page (and its dependencies, e.g. exceljs on
// the Events/Publications import flow) only downloads once actually visited.
const ChatPage = lazy(() => import('./components/ChatPage'));
const LibraryPage = lazy(() => import('./components/LibraryPage'));
const DirectoryPage = lazy(() => import('./components/DirectoryPage'));
const EventsPage = lazy(() => import('./components/EventsPage'));
const PublicationsPage = lazy(() => import('./components/PublicationsPage'));
const AdminPage = lazy(() => import('./components/AdminPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

function RouteFallback() {
  return (
    <div className="login-loading">
      <div className="login-loading-bar" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<ChatPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="directory" element={<DirectoryPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="publications" element={<PublicationsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
