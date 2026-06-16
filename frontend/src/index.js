import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import reportWebVitals from './reportWebVitals';
import { installGlobalErrorHandlers, reportWebVitalMetric } from './services/clientTelemetry';

installGlobalErrorHandlers();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

reportWebVitals(reportWebVitalMetric);
