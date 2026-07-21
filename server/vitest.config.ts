import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// NodeNext-Quellen importieren mit .js-Endung; für vitest lösen wir sie auf die .ts-Datei auf.
export default defineConfig({
  plugins: [
    {
      name: 'containly-js-to-ts',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer && source[0] === '.' && source.endsWith('.js')) {
          const candidate = resolve(dirname(importer), source.slice(0, -3) + '.ts');
          if (existsSync(candidate)) return candidate;
        }
        return null;
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    pool: 'forks',
  },
});
