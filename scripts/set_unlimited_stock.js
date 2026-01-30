const database = require('../js/database');

async function migrate() {
  console.log('Starting migration: Setting stock to Unlimited...');
  await database.initDatabase();
  
  try {
    // Set stock_quantity to NULL where it is currently 0
    database.system.rawQuery('UPDATE menu_items SET stock_quantity = NULL WHERE stock_quantity = 0');
    console.log('Successfully updated stock to Unlimited for items with 0 stock.');
    
    // Also update any negative stock to NULL just in case
    database.system.rawQuery('UPDATE menu_items SET stock_quantity = NULL WHERE stock_quantity < 0');
    
    database.saveDatabase();
    console.log('Database saved.');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
