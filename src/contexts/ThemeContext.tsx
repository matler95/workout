import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** The actual resolved mode after resolving "auto" */
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  resolved: 'light',
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeClass(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read initial value from localStorage (set immediately on page load)
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    return (localStorage.getItem('app-theme') as Theme) || 'light';
  });

  const [systemPref, setSystemPref] = useState<'light' | 'dark'>(getSystemPreference);

  // Resolve the actual theme
  const resolved = theme === 'auto' ? systemPref : theme;

  // Apply the class whenever resolved changes
  useEffect(() => {
    applyThemeClass(resolved);
  }, [resolved]);

  // Listen for system preference changes when theme is "auto"
  useEffect(() => {
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPref(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
    // Apply immediately
    const r = newTheme === 'auto' ? getSystemPreference() : newTheme;
    applyThemeClass(r);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}