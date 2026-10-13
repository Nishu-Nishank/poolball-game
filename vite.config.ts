import { spawn, type ChildProcess } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const SERVER_PORT = 8787;

/**
 * Starts the tournament server (server/index.ts) together with `npm run dev`, so the dashboard's
 * /api requests always have something to talk to. An already running server is reused.
 */
function tournamentServer(): Plugin {
  return {
    name: 'tournament-server',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.VITEST) return;
      // Vite re-evaluates this config on restart; the server process outlives restarts on purpose.
      const shared = globalThis as { tournamentServer?: ChildProcess };
      if (shared.tournamentServer && shared.tournamentServer.exitCode === null) return;
      const running = await fetch(`http://localhost:${SERVER_PORT}/api/health`, { signal: AbortSignal.timeout(800) })
        .then((r) => r.ok)
        .catch(() => false);
      if (running) {
        server.config.logger.info(`  Using the tournament server already running on port ${SERVER_PORT}.`);
        return;
      }
      // --watch restarts the server when server/ code changes during development.
      const child = spawn(process.execPath, ['--watch', '--env-file-if-exists=server/.env', 'server/index.ts'], {
        cwd: import.meta.dirname,
        env: { ...process.env, PORT: String(SERVER_PORT) },
        stdio: 'inherit',
      });
      shared.tournamentServer = child;
      process.once('exit', () => child.kill());
    },
  };
}

// /api is proxied to the tournament server, which fetches the workbook from SharePoint.
export default defineConfig({
  plugins: [react(), tailwindcss(), tournamentServer()],
  server: {
    proxy: {
      '/api': `http://localhost:${SERVER_PORT}`,
    },
  },
  build: {
    // React + MUI form the main chunk (~175 kB gzipped); the Excel parser is split out and lazy-loaded.
    chunkSizeWarningLimit: 700,
  },
});
