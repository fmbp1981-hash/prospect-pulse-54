import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    // Mesmo comportamento do tsconfig ("@/*" → src/* e depois ./*): os helpers
    // de sessão ficam em ./lib/supabase (não existem em src/lib/supabase).
    alias: [
      { find: /^@\/lib\/supabase\/(.*)$/, replacement: path.resolve(__dirname, './lib/supabase/$1') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
