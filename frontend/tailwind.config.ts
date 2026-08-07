import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class', // Enable dark mode via a class for shadcn components
  content: [
    './app/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // System tokens based on your custom OKLCH theme
        background: 'oklch(var(--background))',
        foreground: 'oklch(var(--foreground))',
        card: {
          DEFAULT: 'oklch(var(--card))',
          foreground: 'oklch(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'oklch(var(--popover))',
          foreground: 'oklch(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'oklch(var(--primary))',
          foreground: 'oklch(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary))',
          foreground: 'oklch(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted))',
          foreground: 'oklch(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent))',
          foreground: 'oklch(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive))',
          foreground: 'oklch(var(--foreground))',
        },
        border: 'oklch(var(--border))',
        input: 'oklch(var(--input))',
        ring: 'oklch(var(--ring))',

        // Optional: Custom tokens for charts and sidebar
        // Chart colors use direct FluentUI hex values for consistency and predictability
        chart: {
          1: 'var(--chart-1)',  // Blue
          2: 'var(--chart-2)',  // Green
          3: 'var(--chart-3)',  // Orange
          4: 'var(--chart-4)',  // Red
          5: 'var(--chart-5)',  // Purple
        },
        sidebar: {
          DEFAULT: 'oklch(var(--sidebar))',
          foreground: 'oklch(var(--sidebar-foreground))',
          primary: 'oklch(var(--sidebar-primary))',
          'primary-foreground': 'oklch(var(--sidebar-primary-foreground))',
          accent: 'oklch(var(--sidebar-accent))',
          'accent-foreground': 'oklch(var(--sidebar-accent-foreground))',
          border: 'oklch(var(--sidebar-border))',
          ring: 'oklch(var(--sidebar-ring))',
        },

        // Semantic status tokens — use bg-status-open, text-status-resolved, etc.
        status: {
          open:      'oklch(var(--status-open))',
          assigned:  'oklch(var(--status-assigned))',
          progress:  'oklch(var(--status-progress))',
          pending:   'oklch(var(--status-pending))',
          resolved:  'oklch(var(--status-resolved))',
          escalated: 'oklch(var(--status-escalated))',
          closed:    'oklch(var(--status-closed))',
        },

        // Semantic priority tokens — use bg-priority-high, text-priority-low, etc.
        priority: {
          critical: 'oklch(var(--priority-critical))',
          high:     'oklch(var(--priority-high))',
          medium:   'oklch(var(--priority-medium))',
          low:      'oklch(var(--priority-low))',
        },

        // SLA state tokens — use bg-sla-ok, text-sla-breach, etc.
        sla: {
          ok:      'oklch(var(--sla-ok))',
          warning: 'oklch(var(--sla-warning))',
          breach:  'oklch(var(--sla-breach))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
