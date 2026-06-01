import React, { useEffect, useState } from 'react';

export default function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const [stage, setStage] = useState<'enter' | 'enter-active' | 'entered' | 'exit' | 'exit-active'>('enter');

  useEffect(() => {
    let mounted = true;
    setStage('enter');
    const enterTimeout = setTimeout(() => {
      if (!mounted) return;
      setStage('enter-active');
    }, 10);
    const endTimeout = setTimeout(() => {
      if (!mounted) return;
      setStage('entered');
    }, 300);
    return () => {
      mounted = false;
      clearTimeout(enterTimeout);
      clearTimeout(endTimeout);
    };
  }, [children]);

  return (
    <div className={`page-transition ${stage} ${className ?? ''}`}>
      {children}
    </div>
  );
}
