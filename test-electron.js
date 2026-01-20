const fs = require('fs');
const path = require('path');

// First check the electron package
const electronPkg = require('./node_modules/electron/package.json');
console.log('Electron package.json version:', electronPkg.version);

// Check what index.js returns
const electronPath = require('./node_modules/electron');
console.log('require("electron") returns:', electronPath);

// Check if it's a string (the path to executable)
if (typeof electronPath === 'string') {
  console.log('Electron path is:', electronPath);
  
  // Check if the file exists
  if (fs.existsSync(electronPath)) {
    console.log('File exists!');
  } else {
    console.log('File does NOT exist!');
  }
}
