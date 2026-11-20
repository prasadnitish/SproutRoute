import { lazy, Suspense } from 'react';

// The optional chunk must never prevent the planner from loading.
const Tools = import.meta.env.VITE_WEBMCP_ENABLED === 'true'
  ? lazy(() => import('./Tools.jsx').catch(() => ({ default: () => null })))
  : null;

export default function WebMcpExperiment(props) {
  if (!Tools || !window.isSecureContext || window !== window.top) return null;
  if (typeof document.modelContext?.registerTool !== 'function') return null;
  return <Suspense fallback={null}><Tools {...props} /></Suspense>;
}
