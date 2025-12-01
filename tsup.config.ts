import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/main.ts'],
  format: ['cjs'],
  target: 'node24',
  clean: true,
  sourcemap: true,
  // dependencies in package.json are external by default in tsup
  // This keeps the bundle size small and relies on node_modules
  external: ['vscode-languageserver-protocol', 'vscode-jsonrpc', 'typescript'],
});
