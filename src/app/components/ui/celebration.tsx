import React, { useEffect } from 'react';

interface CelebrationProps {
  show: boolean;
}

export default function Celebration({ show }: CelebrationProps) {
  useEffect(() => {
    if (!show) return;
    try { if (navigator?.vibrate) navigator.vibrate(200); } catch {}
  }, [show]);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <style>{`
        @keyframes confettiDrop{0%{transform:translateY(-20%) rotate(0deg);opacity:0}40%{opacity:1}100%{transform:translateY(120%) rotate(360deg);opacity:1}}
        @keyframes popIn {0%{transform:scale(.2);opacity:0}60%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}
      `}</style>

      {/* Checkmark badge */}
      <div className="absolute left-1/2 top-24 -translate-x-1/2 z-30 flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl bg-white/90 dark:bg-black/80 flex items-center justify-center shadow-xl" style={{animation: 'popIn 350ms ease-out'}}>
          <svg className="w-10 h-10 text-emerald-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="mt-3 text-sm font-semibold text-foreground">Nice work!</div>
      </div>

      {/* Confetti */}
      {Array.from({ length: 18 }).map((_, i) => {
        const left = 5 + (i * 5) % 90;
        const delay = (i % 6) * 60;
        const duration = 700 + (i * 20);
        const emoji = ['🎉','✨','💪','🏅','🎊','🎈'][i % 6];
        const style: React.CSSProperties = {
          left: `${left}%`,
          top: `${-10 - (i % 4) * 6}%`,
          animation: `confettiDrop ${duration}ms ${delay}ms ${i % 2 === 0 ? 'ease-out' : 'cubic-bezier(.2,.9,.2,1)'} forwards`,
        };
        return (
          <span key={i} className="absolute text-2xl" style={style}>{emoji}</span>
        );
      })}
    </div>
  );
}
