import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MenuOrder from './MenuOrder';
import StatsPage from './StatsPage';
import Privacy from './Privacy';
import Marketing from './Marketing';

const path = window.location.pathname;

// Detect if running inside the native iOS/Android app (Capacitor).
// In the native app, always show the guest App — never the marketing page.
const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.();

const Component = isNativeApp
  ? App
  : path.startsWith('/menu') ? MenuOrder
  : path.startsWith('/stats') ? StatsPage
  : path.startsWith('/privacy') ? Privacy
  : path.startsWith('/app') ? App
  : Marketing;

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><Component /></React.StrictMode>);
