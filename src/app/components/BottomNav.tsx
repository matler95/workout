import React from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Home, Calendar, TrendingUp, Library, User } from 'lucide-react';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Home' },
    { path: '/plan', icon: Calendar, label: 'Plan' },
    { path: '/progress', icon: TrendingUp, label: 'Progress' },
    { path: '/library', icon: Library, label: 'Library' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="mx-auto max-w-xl">
        <div className="mx-3 mb-3 bg-card/80 backdrop-blur-xl border border-border/60 rounded-2xl shadow-lg shadow-black/[0.06]">
          <div className="flex justify-around items-center h-16 px-1">
            {navItems.map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 ${
                    isActive ? 'text-primary scale-[1.02]' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className={`relative p-1.5 rounded-xl transition-all duration-200 ${
                    isActive ? 'bg-primary/10' : ''
                  }`}>
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
                    {isActive && (
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className={`text-[10px] mt-0.5 transition-all duration-200 ${
                    isActive ? 'font-semibold text-primary' : 'font-medium'
                  }`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
