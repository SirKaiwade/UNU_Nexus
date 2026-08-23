import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './lib/auth.tsx';
import './index.css';

if (import.meta.env.PROD && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true') {
  throw new Error('VITE_DEV_BYPASS_AUTH cannot be enabled in production.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
