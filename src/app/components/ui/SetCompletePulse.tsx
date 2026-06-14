/**
 * SetCompletePulse — Phase 5.4
 *
 * A brief, subtle ring-pulse animation shown when a set is logged.
 * Rendered as a fixed overlay centered on screen so it doesn't
 * cause layout shifts. Auto-hides after 600 ms.
 *
 * Usage:
 *   const [showPulse, setShowPulse] = useState(false);
 *   // after logging set:
 *   setShowPulse(true); setTimeout(() => setShowPulse(false), 700);
 *
 *   <SetCompletePulse show={showPulse} />
 */

import React from 'react';

interface SetCompletePulseProps {
  show: boolean;
}

export function SetCompletePulse({ show }: SetCompletePulseProps) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
      aria-hidden
    >
      {/* Outer ring — expands and fades */}
      <div
        className="absolute rounded-full border-2 border-emerald-400/70"
        style={{
          width: 80,
          height: 80,
          animation: 'atlas-set-pulse 0.6s ease-out forwards',
        }}
      />
      {/* Inner check mark */}
      <div
        className="relative z-10 w-12 h-12 rounded-full bg-emerald-500/90 flex items-center justify-center shadow-lg"
        style={{
          animation: 'atlas-set-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      {/* Inject keyframes once via a style tag */}
      <style>{`
        @keyframes atlas-set-pulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes atlas-set-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1);   opacity: 0; }
        }
      `}</style>
    </div>
  );
}
