import { defineConfig, Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';

/**
 * Custom Vite Plugin to guarantee 100% Chromium M56 HTML compliance:
 * 1. Strips all <script type="module"> tags (preventing MODULE_SCRIPTS_PROHIBITED)
 * 2. Strips 'nomodule' and 'crossorigin' attributes so scripts load as classic IIFE scripts
 * 3. Enforces <meta name="viewport" content="width=1920, user-scalable=no">
 */
function m56HtmlCleaner(): Plugin {
  return {
    name: 'vite-plugin-m56-cleaner',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        const qmark2 = '?' + '?';
        if (chunk.type === 'chunk' && chunk.code.includes(qmark2)) {
          chunk.code = chunk.code.replace(/\/(\(\))\?\?\//g, 'new RegExp("$1\\x3f\\x3f")');
        }
      }
    },
    transformIndexHtml(html: string) {
      let cleaned = html;

      // 1. Remove modern module script tags completely
      cleaned = cleaned.replace(/<script\s+type=["']module["'][^>]*>[\s\S]*?<\/script>/gi, '');

      // 2. Remove nomodule and crossorigin attributes
      cleaned = cleaned.replace(/\s+nomodule\b/gi, '');
      cleaned = cleaned.replace(/\s+crossorigin(?:=["'][^"']*["'])?/gi, '');

      // 3. Ensure 1080p viewport meta is present
      if (!cleaned.includes('width=1920')) {
        cleaned = cleaned.replace(
          /<head>/i,
          '<head>\n    <meta name="viewport" content="width=1920, user-scalable=no">'
        );
      }

      return cleaned;
    }
  };
}

export default defineConfig({
  root: path.resolve(__dirname, '.'),
  base: './', // MANDATORY for Tizen .wgt local file:// protocol
  plugins: [
    legacy({
      targets: ['chrome 56'],
      renderLegacyChunks: true
    }),
    m56HtmlCleaner()
  ],
  build: {
    outDir: path.resolve(__dirname, '../dist/client'),
    emptyOutDir: true,
    target: 'chrome56',
    cssTarget: 'chrome56',
    minify: 'terser',
    terserOptions: {
      ecma: 2016, // Prohibits ES2017+ object spreads or syntax shortcuts
      format: {
        comments: false
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
