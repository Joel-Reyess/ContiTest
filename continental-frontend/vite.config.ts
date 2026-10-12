import path from "path"
import { execSync } from "child_process"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from "@tailwindcss/vite"

// De qué commit es el build. Se ve en el menú del usuario: así se sabe si un
// arreglo ya llegó al servidor sin adivinar. Si no hay git, "sin-git".
const commitDelBuild = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'sin-git'
  }
})()
const fechaDelBuild = new Date().toISOString().slice(0, 16).replace('T', ' ')

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_BUILD__: JSON.stringify(`${commitDelBuild} · ${fechaDelBuild} UTC`),
  },
  build: {
    outDir: 'build',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

})
