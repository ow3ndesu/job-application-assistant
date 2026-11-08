import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import '@/styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Jobs root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
