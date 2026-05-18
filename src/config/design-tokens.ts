// Single source of truth for all design tokens
// See docs/DESIGN_SYSTEM.md for full specification

export const colors = {
  light: {
    primary: '#FF6B35',
    primaryHover: '#E85A28',
    primaryActive: '#D64B1E',
    secondary: '#7B68EE',
    secondaryHover: '#6A56D1',
    surface: {
      primary: '#FFFFFF',
      secondary: '#F5F5F7',
      tertiary: '#F0F0F5',
      inverse: '#1A1A1A',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#666666',
      tertiary: '#999999',
      inverse: '#FFFFFF',
    },
    border: {
      light: '#E5E5E7',
      medium: '#D0D0D5',
      dark: '#A9A9B3',
    },
    semantic: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
  },
  dark: {
    primary: '#FF6B35',
    primaryHover: '#FF7A4D',
    primaryActive: '#E85A28',
    secondary: '#8B7AFF',
    secondaryHover: '#9D8FFF',
    surface: {
      primary: '#1A1A1A',
      secondary: '#2D2D2D',
      tertiary: '#3A3A3A',
      inverse: '#FFFFFF',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#CCCCCC',
      tertiary: '#999999',
      inverse: '#1A1A1A',
    },
    border: {
      light: '#3A3A3A',
      medium: '#4A4A4A',
      dark: '#5A5A5A',
    },
    semantic: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#60A5FA',
    },
  },
} as const;

export const typography = {
  fontFamily: {
    heading: "'Playfair Display', Georgia, serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
} as const;

export const spacing = {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
  20: '5rem',    // 80px
  24: '6rem',    // 96px
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  card: '0 2px 8px rgba(0, 0, 0, 0.08)',
  cardHover: '0 8px 24px rgba(0, 0, 0, 0.12)',
} as const;

export const borderRadius = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  full: '9999px',
} as const;

export const animation = {
  duration: {
    fast: '150ms',
    base: '250ms',
    slow: '500ms',
  },
  easing: {
    default: 'ease-in-out',
    in: 'ease-in',
    out: 'ease-out',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;
