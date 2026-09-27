import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (
    key &&
    (key.startsWith('sb_secret_') ||
      (key.startsWith('eyJ') &&
        (() => {
          try {
            return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role';
          } catch {
            return false;
          }
        })()))
  ) {
    throw new Error('Secret/service-role keys must never be included in a frontend build. Use a Supabase publishable key.');
  }

  const rootDir = import.meta.dirname || process.cwd();

  return {
    plugins: [
      {
        name: 'admin-route-middleware',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/admin' || req.url === '/admin/') {
              req.url = '/admin.html';
            }
            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@api': resolve(rootDir, '../api')
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        }
      }
    },
    esbuild: {
      legalComments: 'none',
      sourcemap: false
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      minify: 'esbuild',
      cssMinify: true,
      rollupOptions: {
        input: {
          main: resolve(rootDir, 'index.html'),
          admin: resolve(rootDir, 'admin.html'),
          lock: resolve(rootDir, 'lock.html')
        },
        output: {
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash].[ext]',
          sourcemap: false
        }
      }
    }
  };
});
