#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Start the Express server first
const serverProcess = spawn('node', ['server.js'], {
  stdio: 'inherit',
  cwd: __dirname
});

// Wait a moment for the server to start
setTimeout(() => {
  // Then start the Electron app
  const electronProcess = spawn(path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.'], {
    stdio: 'inherit',
    cwd: __dirname
  });

  // Handle process termination
  process.on('SIGINT', () => {
    serverProcess.kill();
    electronProcess.kill();
    process.exit(0);
  });

  serverProcess.on('exit', () => {
    electronProcess.kill();
    process.exit(0);
  });

  electronProcess.on('exit', () => {
    serverProcess.kill();
    process.exit(0);
  });
}, 2000);
