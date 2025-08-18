import designSystem from './src/styles/designSystem.js'

export default {
  content: [
    './src/app/*.{js,ts,jsx,tsx}',
    './src/components/*.{js,ts,jsx,tsx}',
    './src/utils/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/utils/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Colors from design system
      colors: {
        primary: designSystem.colors.primary,
        secondary: designSystem.colors.secondary,
        accent: designSystem.colors.accent,
        background: designSystem.colors.background,
        text: designSystem.colors.text,
        success: designSystem.colors.status.success,
        warning: designSystem.colors.status.warning,
        error: designSystem.colors.status.error,
        info: designSystem.colors.status.info,
        calendar: designSystem.colors.calendar,
        
        // Legacy colors for backward compatibility
        brand: designSystem.colors.primary[600],
        'brand-light': designSystem.colors.primary[100],
        'brand-dark': designSystem.colors.primary[800]
      },
      
      // Typography
      fontFamily: designSystem.typography.fontFamily,
      fontSize: designSystem.typography.fontSize,
      fontWeight: designSystem.typography.fontWeight,
      
      // Spacing
      spacing: designSystem.spacing,
      
      // Border radius
      borderRadius: designSystem.borderRadius,
      
      // Box shadow
      boxShadow: designSystem.boxShadow,
      
      // Transitions
      transitionDuration: designSystem.transitions.duration,
      transitionTimingFunction: designSystem.transitions.timingFunction,
      
      // Screens
      screens: designSystem.screens,
      
      // Animations
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-0.5rem)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        'slide-in': {
          from: {
            transform: 'translateX(100%)',
            opacity: '0',
          },
          to: {
            transform: 'translateX(0)',
            opacity: '1',
          },
        },
        glow: {
          '0%': {
            boxShadow: '0 0 2px rgb(113 92 140), 0 0 4px rgb(113 92 140), 0 0 6px rgb(113 92 140), 0 0 8px rgb(113 92 140)',
          },
          '20%': {
            boxShadow: '0 0 3px rgb(113 92 140), 0 0 6px rgb(113 92 140), 0 0 9px rgb(113 92 140), 0 0 12px rgb(113 92 140)',
          },
          '40%': {
            boxShadow: '0 0 4px rgb(113 92 140), 0 0 8px rgb(113 92 140), 0 0 12px rgb(113 92 140), 0 0 16px rgb(113 92 140)',
          },
          '60%': {
            boxShadow: '0 0 3px rgb(113 92 140), 0 0 6px rgb(113 92 140), 0 0 9px rgb(113 92 140), 0 0 12px rgb(113 92 140)',
          },
          '80%': {
            boxShadow: '0 0 2px rgb(113 92 140), 0 0 4px rgb(113 92 140), 0 0 6px rgb(113 92 140), 0 0 8px rgb(113 92 140)',
          },
          '100%': {
            boxShadow: '0 0 1px rgb(113 92 140), 0 0 2px rgb(113 92 140), 0 0 3px rgb(113 92 140), 0 0 4px rgb(113 92 140)',
          },
        },
        'separator-width': {
          '0%': { width: '0' },
          '100%': { width: '100%' },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.2s ease-out",
        'slide-in': 'slide-in 0.3s ease-out forwards',
        glow: 'glow 2s infinite alternate',
        'separator-width': 'separator-width 1s ease-out forwards',
      },
    },
  },
  plugins: [],
};

