/// <reference types="vitest/config" />
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

// Requests leave the app's own origin only for the street map's tiles (OpenFreeMap).
// blob: workers are for MapLibre.
const TILES = 'https://tiles.openfreemap.org';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${TILES}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

// Cloudflare Workers static assets: the same policy as an HTTP header, which also covers what a meta
// tag can't (frame-ancestors), a few more locks, and caching: the page always revalidated, hashed
// assets kept a year. no-transform keeps Cloudflare from editing the page (on a free plan it would
// add its Web Analytics script).
function cloudflareHeaders(): Plugin {
  const rules: Record<string, string[]> = {
    '/*': [
      `Content-Security-Policy: ${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`,
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Permissions-Policy: camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
      'Cross-Origin-Opener-Policy: same-origin',
    ],
    '/': ['Cache-Control: no-cache, no-transform'],
    '/index.html': ['Cache-Control: no-cache, no-transform'],
    '/assets/*': ['Cache-Control: public, max-age=31536000, immutable'],
  };
  return {
    name: 'poutine:cloudflare-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: Object.entries(rules)
          .map(([path, headers]) => [path, ...headers.map((header) => `  ${header}`)].join('\n'))
          .join('\n')
          .concat('\n'),
      });
    },
  };
}

// Vite's dev server relies on inline styles and a websocket, so the policy only ships in builds.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'poutine:content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

export default defineConfig({
  plugins: [preact(), contentSecurityPolicy(), cloudflareHeaders()],
  // MapLibre (about 1 MB) is its own chunk, loaded only once the map shows.
  build: { chunkSizeWarningLimit: 1100 },
  preview: { port: 4180, strictPort: true },
  server: { port: 5180, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
