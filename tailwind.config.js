/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // UN / UNDP design system inspired palette. Brand blue stays fixed
        // across light/dark; the neutral scale and pale-blue tints below are
        // backed by CSS custom properties (see :root / [data-theme=dark] in
        // src/index.css) so bg-surface, text-ink, border-rule, text-gray-500
        // etc. all repaint automatically for dark mode.
        un: {
          blue: '#006EB6',         // UN primary blue
          'blue-dark': '#0468AC',
          'blue-darker': '#02457F',
          'blue-light': '#3288CE',
          'blue-soft': 'rgb(var(--un-blue-soft) / <alpha-value>)',
          'blue-bg': 'rgb(var(--un-blue-bg) / <alpha-value>)',
          'blue-text': 'var(--un-blue-text)',
        },
        accent: {
          red: '#D12800',          // UN data red
          gold: '#FBC412',         // UN data gold
          green: '#5DD09E',        // success/active
          teal: '#00C1D4',
          purple: '#A21D5A',
        },
        // Neutral system (UNDP grayscale) — theme-aware via CSS vars.
        gray: {
          50: 'rgb(var(--gray-50) / <alpha-value>)',
          100: 'rgb(var(--gray-100) / <alpha-value>)',
          200: 'rgb(var(--rule) / <alpha-value>)',
          300: 'rgb(var(--rule-strong) / <alpha-value>)',
          400: 'rgb(var(--gray-400) / <alpha-value>)',
          500: 'rgb(var(--ink-muted) / <alpha-value>)',
          600: 'rgb(var(--gray-600) / <alpha-value>)',
          700: 'rgb(var(--gray-700) / <alpha-value>)',
          800: 'rgb(var(--ink) / <alpha-value>)',
          900: 'rgb(var(--gray-900) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          subtle: 'rgb(var(--surface-subtle) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted) / <alpha-value>)',
        },
        ink: 'rgb(var(--ink) / <alpha-value>)',
        rule: 'rgb(var(--rule) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Helvetica', 'Arial', 'sans-serif'],
        serif: ['"IBM Plex Serif"', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['"IBM Plex Mono"', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['56px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-xl': ['44px', { lineHeight: '1.1', letterSpacing: '-0.015em', fontWeight: '700' }],
        'display-l': ['32px', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-m': ['24px', { lineHeight: '1.25', letterSpacing: '-0.005em', fontWeight: '600' }],
        'h1': ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        'h2': ['17px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-l': ['16px', { lineHeight: '1.6' }],
        'body-m': ['14px', { lineHeight: '1.55' }],
        'body-s': ['13px', { lineHeight: '1.5' }],
        'caption': ['12px', { lineHeight: '1.4' }],
        'overline': ['11px', { lineHeight: '1.2', letterSpacing: '0.08em' }],
      },
      maxWidth: {
        grid: '1440px',
        prose: '720px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(26, 31, 44, 0.04)',
        elevated: '0 4px 16px rgba(26, 31, 44, 0.06), 0 1px 3px rgba(26, 31, 44, 0.04)',
        panel: '0 8px 24px rgba(26, 31, 44, 0.08), 0 2px 6px rgba(26, 31, 44, 0.04)',
        focus: '0 0 0 3px rgba(0, 110, 182, 0.25)',
      },
      borderRadius: {
        none: '0',
        xs: '6px',
        sm: '8px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
    },
  },
  plugins: [],
};
