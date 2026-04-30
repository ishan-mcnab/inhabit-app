import type { Config } from 'tailwindcss'

/** Navy + amber rebrand tokens (mirrors `src/index.css` @theme). */
export default {
  theme: {
    extend: {
      colors: {
        'app-bg': '#0A0F1E',
        'app-surface': '#111827',
        'app-surface-2': '#141C2E',
        'app-accent': '#F5A623',
        'app-accent-light': '#FFD080',
        'app-text': '#E8EDF8',
        'app-muted': '#888780',
        'app-border': '#1C2840',
      },
    },
  },
} satisfies Config
