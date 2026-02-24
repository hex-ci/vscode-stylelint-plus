import { rollup, watch } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

const distDir = join(__dirname, '../dist');

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

function createPlugins() {
  return [
    resolve({ preferBuiltins: true }),
    commonjs({ ignore: ['typescript'], ignoreDynamicRequires: true }),
    json(),
    ...(production ? [terser()] : []),
  ];
}

const sharedExternal = ['vscode', 'typescript'];

function onwarn(warning, defaultHandler) {
  if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.ids?.some(id => id.includes('node_modules'))) {
    return;
  }
  defaultHandler(warning);
}

const clientConfig = {
  input: join(__dirname, '../src/client/index.js'),
  external: sharedExternal,
  plugins: createPlugins(),
  onwarn,
  output: {
    file: join(__dirname, '../dist/index.js'),
    format: 'cjs',
    sourcemap: !production,
  },
};

const serverConfig = {
  input: { server: join(__dirname, '../src/server/entry.js') },
  external: sharedExternal,
  plugins: createPlugins(),
  onwarn,
  output: {
    dir: join(__dirname, '../dist'),
    format: 'cjs',
    sourcemap: !production,
    entryFileNames: '[name].js',
    chunkFileNames: '[name].js',
    manualChunks(id) {
      if (/[\\/]node_modules[\\/]stylelint[\\/]/.test(id)) {
        return 'stylelint-vendor';
      }
    },
  },
};

async function main() {
  try {
    if (isWatch) {
      const watcher = watch([clientConfig, serverConfig]);

      watcher.on('event', (event) => {
        switch (event.code) {
          case 'BUNDLE_END':
            console.log(`Bundle complete: ${event.duration}ms`);
            event.result.close();
            break;
          case 'ERROR':
            console.error('Build error:', event.error);
            break;
        }
      });

      console.log('Watching for changes...');
    }
    else {
      const clientBundle = await rollup(clientConfig);
      await clientBundle.write(clientConfig.output);
      await clientBundle.close();

      const serverBundle = await rollup(serverConfig);
      await serverBundle.write(serverConfig.output);
      await serverBundle.close();

      console.log('Build complete!');
    }
  }
  catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
