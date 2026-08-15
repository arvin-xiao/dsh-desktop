import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const external = [
  'electron',
  ...Object.keys(pkg.dependencies || {}),
];

export default defineConfig([
  {
    entry: { 'main/index': 'src/main/index.ts' },
    outDir: 'out',
    format: ['cjs'],
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    clean: true,
    shims: true,
    external,
    esbuildOptions(options) {
      options.banner = { js: '"use strict";' };
    },
  },
  {
    entry: { 'preload/index': 'src/preload/index.ts' },
    outDir: 'out',
    format: ['cjs'],
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    clean: false,
    shims: true,
    external,
  },
]);
