// Railway-inspired Design System

export const colors = {
  // Background layers
  bg: {
    primary: '#0A0A0A',      // Deep black (Railway-style)
    secondary: '#111111',    // Card background
    tertiary: '#1A1A1A',     // Elevated elements
    hover: '#222222',        // Hover states
  },

  // Brand colors
  brand: {
    primary: '#E91E63',      // Pink (SpendFlo)
    hover: '#C2185B',
    light: '#F48FB1',
    gradient: 'linear-gradient(135deg, #E91E63 0%, #F50057 100%)',
  },

  // Semantic colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Text
  text: {
    primary: '#FFFFFF',
    secondary: '#A1A1AA',
    tertiary: '#71717A',
    disabled: '#52525B',
  },

  // Borders
  border: {
    default: '#27272A',
    hover: '#3F3F46',
    focus: '#E91E63',
  },
};

export const spacing = {
  xs: '0.5rem',   // 8px
  sm: '0.75rem',  // 12px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
  '3xl': '4rem',  // 64px
};

export const typography = {
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
    mono: '"Fira Code", "SF Mono", "Courier New", monospace',
  },

  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '2rem',    // 32px
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const effects = {
  // Glassmorphism (Railway-style)
  glass: {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },

  // Shadows
  shadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
  },

  // Hover glow
  glow: {
    pink: '0 0 20px rgba(233, 30, 99, 0.3)',
    success: '0 0 20px rgba(16, 185, 129, 0.3)',
    warning: '0 0 20px rgba(245, 158, 11, 0.3)',
  },

  // Transitions
  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

export const borderRadius = {
  sm: '0.375rem',  // 6px
  md: '0.5rem',    // 8px
  lg: '0.75rem',   // 12px
  xl: '1rem',      // 16px
  '2xl': '1.5rem', // 24px
  full: '9999px',
};
