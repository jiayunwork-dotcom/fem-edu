import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import sveltePreprocess from 'svelte-preprocess';

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess({
        sourceMap: false,
        defaults: {
          script: 'typescript'
        },
        typescript: {
          compilerOptions: {
            strict: false,
            noImplicitAny: false,
            noImplicitThis: false,
            strictNullChecks: false
          }
        }
      })
    })
  ],
  resolve: {
    alias: {
      $lib: resolve('./src/lib')
    }
  },
  server: {
    port: 5173,
    open: false
  }
});
