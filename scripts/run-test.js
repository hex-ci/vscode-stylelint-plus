const { spawn } = require('child_process');
const path = require('path');

const isLinux = process.platform === 'linux';
const testFile = path.join(__dirname, '../test/run-suite.js');

const command = isLinux ? 'xvfb-run' : 'node';
const args = isLinux ? ['-a', 'node', testFile] : [testFile];

console.log(`Running tests on ${process.platform}...`);
console.log(`Command: ${command} ${args.join(' ')}\n`);

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('Failed to start test process:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});
