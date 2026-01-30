import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global error handlers to catch "Failed to load" issues
window.addEventListener('error', (event) => {
  console.error("CRITICAL APP ERROR (Global):", event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error("CRITICAL APP ERROR (Promise):", event.reason);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  const msg = "Could not find root element to mount to";
  console.error(msg);
  throw new Error(msg);
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  console.error("React Mount Failed:", e);
}