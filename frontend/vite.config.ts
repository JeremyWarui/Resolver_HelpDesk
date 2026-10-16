import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker only active in production build; dev uses browser's network directly.
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Resolver — KSG Maintenance Helpdesk',
        short_name: 'Resolver',
        description: 'Report a fault and follow it until it is fixed.',
        theme_color: '#5C431C',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/',
        // `/` sends a signed-in user to their own role's dashboard.
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    }
  },
  server: {
    proxy: {
      "/data.json": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  // preview proxy — forwards the API and uploaded files to local Django so
  // phone/LAN testing works. Origin is pinned to localhost:4173 so Django's
  // CORS_ALLOWED_ORIGINS matches whichever LAN IP the phone used.
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        headers: { 'Origin': 'http://localhost:4173' },
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          // Vendor chunk for React and core libraries
          if (id.includes('react') || id.includes('react-router')) {
            return 'react-vendor';
          }
          // UI library chunk
          if (id.includes('@tanstack/react-table') || id.includes('sonner') || 
              id.includes('react-hook-form') || id.includes('@hookform') || 
              id.includes('zod')) {
            return 'ui-vendor';
          }
          // Chart/visualization libraries
          if (id.includes('recharts')) {
            return 'charts-vendor';
          }
          // Utilities and icons chunk
          if (id.includes('clsx') || id.includes('tailwind-merge') || 
              id.includes('lucide-react') || id.includes('axios')) {
            return 'utils-vendor';
          }
        }
      }
    },
    // Increase chunk size warning limit to 1000kb (current is 500kb)
    chunkSizeWarningLimit: 1000
  }
})
