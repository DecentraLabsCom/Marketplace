import designSystem from './src/styles/designSystem.js'

export default {
  content: [
    './src/app/*.{js,ts,jsx,tsx}',
    './src/components/*.{js,ts,jsx,tsx}',
    './src/utils/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/utils/**/*.{js,ts,jsx,tsx}',
    './src/styles/**/*.{css,js}',
  ],
  safelist: [
    // Ensure global CSS classes and their dependencies are always included
    'separator-width',
    'separator-width-black',
    'animate-separator-width',
    // Size utilities (already defined in global.css)
    { pattern: /^size-/ },
  ],
  theme: {
    extend: {
      // Colors from design system
      colors: {
        primary: designSystem.colors.primary,
        secondary: designSystem.colors.secondary,
        accent: designSystem.colors.text.accent,
        background: designSystem.colors.background,
        text: designSystem.colors.text,
        success: designSystem.colors.status.success,
        warning: designSystem.colors.status.warning,
        error: designSystem.colors.status.error,
        info: designSystem.colors.status.info,
        calendar: designSystem.colors.calendar,
        booking: designSystem.colors.booking,
        brand: designSystem.colors.brand,
        ui: designSystem.colors.ui,
        
        // Direct token aliases for common colors
        'header-bg': designSystem.colors.calendar.header,       // #caddff
        'hover-dark': designSystem.colors.calendar.hover,       // #333f63
        'brand-primary': designSystem.colors.brand.primary,     // #715c8c
        'brand-secondary': designSystem.colors.brand.secondary, // #caddff
        'text-secondary': designSystem.colors.text.secondary,   // #335763
        'ui-label-dark': designSystem.colors.ui.label.dark,     // #3f3363
        
        // Neutral/Gray tokens for replacing generic Tailwind grays
        'neutral': designSystem.colors.text.neutral,
        'gray': designSystem.colors.text.neutral,  // Override default Tailwind grays
        
        // Status tokens for replacing generic colors
        'success-bg': designSystem.colors.status.success.bg,
        'success-text': designSystem.colors.status.success.text,
        'success-border': designSystem.colors.status.success.border,
        'error-bg': designSystem.colors.status.error.bg,
        'error-text': designSystem.colors.status.error.text,
        'error-border': designSystem.colors.status.error.border,
        'warning-bg': designSystem.colors.status.warning.bg,
        'warning-text': designSystem.colors.status.warning.text,
        'warning-border': designSystem.colors.status.warning.border,
        'info-bg': designSystem.colors.status.info.bg,
        'info-text': designSystem.colors.status.info.text,
        'info-border': designSystem.colors.status.info.border,
        
        // Booking status tokens
        'booking-pending-bg': designSystem.colors.booking.pending.bg,
        'booking-pending-text': designSystem.colors.booking.pending.text,
        'booking-pending-border': designSystem.colors.booking.pending.border,
        'booking-confirmed-bg': designSystem.colors.booking.confirmed.bg,
        'booking-confirmed-text': designSystem.colors.booking.confirmed.text,
        'booking-confirmed-border': designSystem.colors.booking.confirmed.border,
        'booking-used-bg': designSystem.colors.booking.used.bg,
        'booking-used-text': designSystem.colors.booking.used.text,
        'booking-used-border': designSystem.colors.booking.used.border,
        'booking-collected-bg': designSystem.colors.booking.collected.bg,
        'booking-collected-text': designSystem.colors.booking.collected.text,
        'booking-collected-border': designSystem.colors.booking.collected.border,
        'booking-cancelled-bg': designSystem.colors.booking.cancelled.bg,
        'booking-cancelled-text': designSystem.colors.booking.cancelled.text,
        'booking-cancelled-border': designSystem.colors.booking.cancelled.border,
        
        // Single brand token (for backward compatibility)
        'brand-legacy': designSystem.colors.brand.primary            // #715c8c
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
            boxShadow: `0 0 2px ${designSystem.colors.brand.primary}, 0 0 4px ${designSystem.colors.brand.primary}, 0 0 6px ${designSystem.colors.brand.primary}, 0 0 8px ${designSystem.colors.brand.primary}`,
          },
          '20%': {
            boxShadow: `0 0 3px ${designSystem.colors.brand.primary}, 0 0 6px ${designSystem.colors.brand.primary}, 0 0 9px ${designSystem.colors.brand.primary}, 0 0 12px ${designSystem.colors.brand.primary}`,
          },
          '40%': {
            boxShadow: `0 0 4px ${designSystem.colors.brand.primary}, 0 0 8px ${designSystem.colors.brand.primary}, 0 0 12px ${designSystem.colors.brand.primary}, 0 0 16px ${designSystem.colors.brand.primary}`,
          },
          '60%': {
            boxShadow: `0 0 3px ${designSystem.colors.brand.primary}, 0 0 6px ${designSystem.colors.brand.primary}, 0 0 9px ${designSystem.colors.brand.primary}, 0 0 12px ${designSystem.colors.brand.primary}`,
          },
          '80%': {
            boxShadow: `0 0 2px ${designSystem.colors.brand.primary}, 0 0 4px ${designSystem.colors.brand.primary}, 0 0 6px ${designSystem.colors.brand.primary}, 0 0 8px ${designSystem.colors.brand.primary}`,
          },
          '100%': {
            boxShadow: `0 0 1px ${designSystem.colors.brand.primary}, 0 0 2px ${designSystem.colors.brand.primary}, 0 0 3px ${designSystem.colors.brand.primary}, 0 0 4px ${designSystem.colors.brand.primary}`,
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
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};

