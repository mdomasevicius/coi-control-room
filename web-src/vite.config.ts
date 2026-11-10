import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'

// The game's web API has no CORS, so the dev server proxies it to keep requests same-origin
// (in the mod build the game serves the app itself). Override the target with GAME_API_URL.
const GAME_PATHS = ['/api', '/command', '/commands', '/routes', '/screenshot', '/demo-dashboard']

// Read-only mode (VITE_READ_ONLY=true, see `pnpm dev:safe`): everything that changes the game (pause, speed,
// pins, console) is a POST /command, and the game's read routes are all GETs. So the server answers only GET
// and HEAD, for any path, and refuses /command whatever the method. The app also hides those controls, but
// that's cosmetic; this guard is what stops a visitor (or curl) from sending commands.
function readOnlyGuard(): Plugin {
  const guard: Connect.NextHandleFunction = (req, res, next) => {
    let path = (req.url ?? '').split('?')[0]
    try {
      path = new URL(decodeURIComponent(path), 'http://x').pathname.replace(/\/{2,}/g, '/')
    } catch {
      path = '/command' // undecodable: refuse
    }
    if ((req.method !== 'GET' && req.method !== 'HEAD') || path === '/command' || path.startsWith('/command/')) {
      res.statusCode = 403
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'read_only', message: 'Read-only: commands are disabled on this server' }))
      return
    }
    next()
  }
  // Middlewares added directly in these hooks run before Vite's own, including the proxy.
  return {
    name: 'coi-read-only-guard',
    configureServer: (server) => void server.middlewares.use(guard),
    configurePreviewServer: (server) => void server.middlewares.use(guard),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.GAME_API_URL || 'http://localhost:3073'
  const readOnly = env.VITE_READ_ONLY === 'true'
  const proxy = Object.fromEntries(GAME_PATHS.map((p) => [p, { target, changeOrigin: true }]))

  return {
    plugins: [...(readOnly ? [readOnlyGuard()] : []), tailwindcss(), svelte()],
    // `@/x` = `src/x`; mirrored in tsconfig.app.json `paths` for the type checker.
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  }
})
