const fs = require('fs');
const endpoints = [
  'combo-endpoints',
  'weight-endpoints',
  'split-bill-endpoints',
  'void-refund-endpoints',
  'kds-endpoints',
  'hardware-endpoints',
  'digital-receipt-endpoints',
  'loyalty-endpoints',
  'online-order-endpoints',
  'recipe-endpoints',
  'cash-drawer-endpoints',
  'buzzer-endpoints',
  'table-endpoints',
  'offline-endpoints'
];

endpoints.forEach(ep => {
  const content = `// ${ep.replace('-', ' ')} Endpoints - Placeholder
const express = require('express');
const router = express.Router();

// Placeholder route
router.get(\`/api/${ep.replace('-', '/')}/test\`, (req, res) => {
  res.json({ message: '${ep} placeholder' });
});

module.exports = router;`;
  fs.writeFileSync(`js/${ep}.js`, content);
  console.log('Created:', ep);
});

console.log('\nAll endpoint files created successfully!');