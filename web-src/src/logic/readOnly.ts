// Read-only build/dev server (VITE_READ_ONLY=true, `pnpm dev:safe`): controls that send game commands are
// hidden. The server-side guard in vite.config.ts is what actually blocks them; this only keeps the UI honest.
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === 'true'
