import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

// Transforms .md files to ES string exports — mirrors tsup's `loader: { '.md': 'text' }`.
// Required because vitest uses Vite for module transforms (not esbuild/tsup).
const markdownTextPlugin: Plugin = {
  name: 'md-to-string',
  transform(src, id) {
    if (id.endsWith('.md')) {
      return { code: `export default ${JSON.stringify(src)};`, map: null };
    }
  },
};

export default defineConfig({
  plugins: [markdownTextPlugin],
});
