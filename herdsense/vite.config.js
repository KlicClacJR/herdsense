import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prevent duplicate React copies causing "resolveDispatcher().useState" crashes
    dedupe: ['react', 'react-dom'],
  },
})
