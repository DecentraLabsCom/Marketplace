/**
 * DecentraLabs Design System - Color Palette and Design Tokens
 * Central source of truth for all styling variables and tokens
 */

// Brand Colors
export const colors = {
  // Primary brand colors
  primary: {
    50: '#f0f0ff',
    100: '#e8e5ff',
    200: '#d6d0ff',
    300: '#beb3ff',
    400: '#a08fff',
    500: '#8068ff',
    600: '#715c8c', // Main brand color
    700: '#5a4a70',
    800: '#4a3d5c',
    900: '#3d324a',
    950: '#241d30'
  },
  
  // Secondary colors
  secondary: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617'
  },
  
  // Accent colors
  accent: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49'
  },
  
  // UI Colors  
  background: {
    light: '#ffffff',
    dark: '#0a0a0a',
    surface: '#262B2D', // Main app background
    card: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.5)'
  },
  
  // Text colors
  text: {
    primary: '#171717',
    secondary: '#4b5563',
    muted: '#9ca3af',
    inverse: '#ffffff',
    accent: '#715c8c'
  },
  
  // Status colors
  status: {
    success: {
      light: '#dcfce7',
      DEFAULT: '#16a34a',
      dark: '#166534'
    },
    warning: {
      light: '#fef3c7',
      DEFAULT: '#f59e0b',
      dark: '#d97706'
    },
    error: {
      light: '#fef2f2',
      DEFAULT: '#dc2626',
      dark: '#991b1b'
    },
    info: {
      light: '#dbeafe',
      DEFAULT: '#3b82f6',
      dark: '#1d4ed8'
    }
  },
  
  // Calendar and booking colors
  calendar: {
    header: '#caddff',
    selected: '#715c8c',
    hover: '#333f63',
    booked: '#9fc6f5',
    pending: '#f59e0b',
    available: '#16a34a'
  }
}

// Typography scale
export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['Consolas', 'Monaco', 'monospace']
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    '5xl': ['3rem', { lineHeight: '1' }],
    '6xl': ['3.75rem', { lineHeight: '1' }]
  },
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800'
  }
}

// Spacing scale
export const spacing = {
  0: '0px',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  32: '8rem',
  40: '10rem',
  48: '12rem',
  56: '14rem',
  64: '16rem'
}

// Border radius
export const borderRadius = {
  none: '0',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px'
}

// Shadows
export const boxShadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',
  glow: '0 0 20px rgb(113 92 140 / 0.3)'
}

// Transitions
export const transitions = {
  duration: {
    75: '75ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    300: '300ms',
    500: '500ms',
    700: '700ms',
    1000: '1000ms'
  },
  timingFunction: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)'
  }
}

// Component design tokens
export const components = {
  button: {
    padding: {
      sm: '0.375rem 0.75rem',
      md: '0.5rem 1rem',
      lg: '0.75rem 1.5rem',
      xl: '1rem 2rem'
    },
    borderRadius: borderRadius.md,
    fontWeight: typography.fontWeight.medium,
    transition: 'all 150ms ease-in-out'
  },
  
  input: {
    padding: '0.5rem 0.75rem',
    borderRadius: borderRadius.md,
    borderWidth: '1px',
    transition: 'border-color 150ms ease-in-out, box-shadow 150ms ease-in-out'
  },
  
  card: {
    padding: '1.5rem',
    borderRadius: borderRadius.lg,
    boxShadow: boxShadow.md,
    transition: 'transform 150ms ease-in-out, box-shadow 150ms ease-in-out'
  },
  
  modal: {
    borderRadius: borderRadius.lg,
    padding: '1.5rem',
    maxWidth: '32rem',
    boxShadow: boxShadow['2xl']
  }
}

// Animation presets
export const animations = {
  fadeIn: 'fadeIn 200ms ease-out',
  slideIn: 'slide-in 300ms ease-out forwards',
  glow: 'glow 2s infinite alternate',
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
}

// Breakpoints
export const screens = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
}

// Design system object
const designSystem = {
  colors,
  typography,
  spacing,
  borderRadius,
  boxShadow,
  transitions,
  components,
  animations,
  screens
}

export default designSystem
