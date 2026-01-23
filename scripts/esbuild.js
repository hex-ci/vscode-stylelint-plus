const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');
const production = process.env.NODE_ENV === 'production';

const distDir = path.join(__dirname, '../dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const baseConfig = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: !production,
  minify: production,
  external: [
    'vscode',
    'stylelint'
  ],
  logLevel: 'info'
};

const clientConfig = {
  ...baseConfig,
  entryPoints: [path.join(__dirname, '../src/index.js')],
  outfile: path.join(__dirname, '../dist/index.js')
};

const serverConfig = {
  ...baseConfig,
  entryPoints: [path.join(__dirname, '../src/server.js')],
  outfile: path.join(__dirname, '../dist/server.js')
};

async function build() {
  try {
    if (isWatch) {
      const clientContext = await esbuild.context(clientConfig);
      const serverContext = await esbuild.context(serverConfig);

      await clientContext.watch();
      await serverContext.watch();

      console.log('Watching for changes...');
    }
    else {
      await esbuild.build(clientConfig);
      await esbuild.build(serverConfig);

      console.log('Build complete!');
    }
  }
  catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
