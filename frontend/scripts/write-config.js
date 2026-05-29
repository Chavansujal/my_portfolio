const fs = require('fs');
const path = require('path');

const backendUrl =
  process.env.GESTURE_BACKEND_URL || process.env.VITE_GESTURE_BACKEND_URL || '';

const configPath = path.join(__dirname, '..', 'config.js');
const config = `window.GESTURE_BACKEND_URL = ${JSON.stringify(backendUrl)};\n`;

fs.writeFileSync(configPath, config);
console.log(`Wrote config.js with ${backendUrl || 'same-origin'} gesture backend.`);
