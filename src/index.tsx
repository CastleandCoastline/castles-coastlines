import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MenuOrder from './MenuOrder';
import StatsPage from './StatsPage';
import Privacy from './Privacy';

const path = window.location.pathname;
const Component = path.startsWith('/menu') ? MenuOrder : path.startsWith('/stats') ? StatsPage : path.startsWith('/privacy') ? Privacy : App;

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><Component /></React.StrictMode>);
