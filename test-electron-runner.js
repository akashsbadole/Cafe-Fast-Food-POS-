// This script tests require('electron') in Electron context
const electron = require('electron');
console.log('Electron loaded successfully');
console.log('typeof electron:', typeof electron);
console.log('Keys:', Object.keys(electron).slice(0, 10));
console.log('app:', typeof electron.app);
console.log('whenReady:', typeof electron.app?.whenReady);
