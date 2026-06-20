import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../net-client/SIUTeam.MetaAI/nodejs/public',
    emptyOutDir: true
  }
})
