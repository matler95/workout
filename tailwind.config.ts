import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      fontSize: {
        'hero': ['2rem', { lineHeight: '1.2', fontWeight: '600' }],        // 32px
        'title': ['1.5rem', { lineHeight: '1.4', fontWeight: '600' }],      // 24px
        'body': ['1rem', { lineHeight: '1.5', fontWeight: '400' }],         // 16px
        'caption': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],  // 14px
        'small': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],     // 12px
      },
      fontWeight: {
        normal: '400',
        bold: '600',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 3px rgba(16, 185, 129, 0.06)',
        'soft': '0 4px 12px rgba(16, 185, 129, 0.08)',
        'elevated': '0 8px 24px rgba(0, 0, 0, 0.08)',
        'glow-emerald': '0 4px 16px rgba(16, 185, 129, 0.15)',
        'glow-cyan': '0 4px 16px rgba(6, 182, 212, 0.15)',
        'glow-amber': '0 4px 16px rgba(245, 158, 11, 0.15)',
      },
    },
  },
  plugins: [],
} satisfies Config
