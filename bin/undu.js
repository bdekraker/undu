#!/usr/bin/env node
/**
 * undu CLI launcher
 * Uses native binary if available, falls back to bun
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const platform = os.platform();
const arch = os.arch();

// Map to binary names
const binaries = {
  'win32-x64': 'undu-win.exe',
  'linux-x64': 'undu-linux',
  'darwin-arm64': 'undu-macos',
  'darwin-x64': 'undu-macos-x64',
};

const key = `${platform}-${arch}`;
const binaryName = binaries[key];
const binDir = path.join(__dirname, '..', 'dist', 'bin');
const binaryPath = binaryName ? path.join(binDir, binaryName) : null;

// Try native binary first
if (binaryPath && fs.existsSync(binaryPath)) {
  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    shell: false
  });
  child.on('exit', (code) => process.exit(code || 0));
} else {
  // Fall back to bun
  let bunPath;
  try {
    bunPath = execSync('which bun 2>/dev/null || where bun 2>nul', { encoding: 'utf8' }).trim().split('\n')[0];
  } catch {
    console.error('Error: undu requires Bun to run on this platform.');
    console.error('');
    console.error('Install Bun: https://bun.sh');
    console.error('  curl -fsSL https://bun.sh/install | bash');
    console.error('');
    console.error('Or download the standalone binary from:');
    console.error('  https://github.com/bdekraker/undu/releases');
    process.exit(1);
  }

  const cliPath = path.join(__dirname, '..', 'src', 'cli', 'index.ts');
  const child = spawn(bunPath, ['run', cliPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false
  });
  child.on('exit', (code) => process.exit(code || 0));
}
