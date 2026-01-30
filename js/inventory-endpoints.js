// Enhanced Inventory Management API Endpoints
// This file contains all the API endpoints for the enhanced inventory management system

const express = require('express');
const router = express.Router();
const db = require('./database');
const { validateInventoryItem, validateStockAdjustment, validateCategory, validateSupplier } = require('./inventory-validation');
const { logInventoryAction } = require('./inventory-logger');

// =================== INVENTORY CATEGORIES ===================

// GET all inventory categories
router.get('/inventory/categories', async (req, res) => {
  try {
    const [categories] = await db.execute(`
      SELECT c.*, COUNT(i.id) as item_count
      FROM inventory_categories c
      LEFT JOIN inventory_items i ON c.id = i.category_id
      GROUP BY c.id
      ORDER BY c.name
    `);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching inventory categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET inventory category by ID
router.get('/inventory/categories/:id', async (req, res) => {
  try {
    const categories = await db.query(
      'SELECT * FROM inventory_categories WHERE id = ?',
      [req.params.id]
    );
    
    if (categories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(categories[0]);
  } catch (error) {
    console.error('Error fetching inventory category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST create inventory category
router.post('/inventory/categories', async (req, res) => {
  try {
    const { error, value } = validateCategory(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, description } = value;
    
    // Check if category already exists
    const existing = await db.query(
      'SELECT id FROM inventory_categories WHERE name = ?',
      [name]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Category with this name already exists' });
    }

    const result = await db.query(
      'INSERT INTO inventory_categories (name, description, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [name, description || null]
    );

    const newCategory = await db.query(
      'SELECT * FROM inventory_categories WHERE id = ?',
      [result.insertId]
    );

    await logInventoryAction(null, 'CATEGORY_CREATED', `Category created: ${name}`, req.user?.id);
    
    res.status(201).json(newCategory[0]);
  } catch (error) {
    console.error('Error creating inventory category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT update inventory category
router.put('/inventory/categories/:id', async (req, res) => {
  try {
    const { error, value } = validateCategory(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, description } = value;
    const categoryId = req.params.id;

    // Check if category exists
    const existing = await db.query(
      'SELECT * FROM inventory_categories WHERE id = ?',
      [categoryId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check for duplicate name (excluding current category)
    const duplicate = await db.query(
      'SELECT id FROM inventory_categories WHERE name = ? AND id != ?',
      [name, categoryId]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({ error: 'Category with this name already exists' });
    }

    await db.query(
      'UPDATE inventory_categories SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description || null, categoryId]
    );

    const updatedCategory = await db.query(
      'SELECT * FROM inventory_categories WHERE id = ?',
      [categoryId]
    );

    await logInventoryAction(null, 'CATEGORY_UPDATED', `Category updated: ${name}`, req.user?.id);
    
    res.json(updatedCategory[0]);
  } catch (error) {
    console.error('Error updating inventory category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE inventory category
router.delete('/inventory/categories/:id', async (req, res) => {
  try {
    const categoryId = req.params.id;

    // Check if category exists
    const existing = await db.query(
      'SELECT * FROM inventory_categories WHERE id = ?',
      [categoryId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has items
    const items = await db.query(
      'SELECT id FROM inventory_items WHERE category_id = ?',
      [categoryId]
    );

    if (items.length > 0) {
      return res.status(400).json({ error: 'Cannot delete category with existing items. Move items to another category first.' });
    }

    await db.query('DELETE FROM inventory_categories WHERE id = ?', [categoryId]);
    
    await logInventoryAction(null, 'CATEGORY_DELETED', `Category deleted: ${existing[0].name}`, req.user?.id);
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// =================== INVENTORY SUPPLIERS ===================

// GET all inventory suppliers
router.get('/inventory/suppliers', async (req, res) => {
  try {
    const suppliers = await db.query(`
      SELECT s.*, COUNT(i.id) as item_count
      FROM inventory_suppliers s
      LEFT JOIN inventory_items i ON s.id = i.supplier_id
      GROUP BY s.id
      ORDER BY s.name
    `);
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching inventory suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// GET inventory supplier by ID
router.get('/inventory/suppliers/:id', async (req, res) => {
  try {
    const suppliers = await db.query(
      'SELECT * FROM inventory_suppliers WHERE id = ?',
      [req.params.id]
    );
    
    if (suppliers.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    res.json(suppliers[0]);
  } catch (error) {
    console.error('Error fetching inventory supplier:', error);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

// POST create inventory supplier
router.post('/inventory/suppliers', async (req, res) => {
  try {
    const { error, value } = validateSupplier(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, contact_person, phone, email, address, notes } = value;
    
    // Check if supplier already exists by name
    const existing = await db.query(
      'SELECT id FROM inventory_suppliers WHERE name = ?',
      [name]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Supplier with this name already exists' });
    }

    const result = await db.query(
      'INSERT INTO inventory_suppliers (name, contact_person, phone, email, address, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [name, contact_person || null, phone || null, email || null, address || null, notes || null]
    );

    const newSupplier = await db.query(
      'SELECT * FROM inventory_suppliers WHERE id = ?',
      [result.insertId]
    );

    await logInventoryAction(null, 'SUPPLIER_CREATED', `Supplier created: ${name}`, req.user?.id);
    
    res.status(201).json(newSupplier[0]);
  } catch (error) {
    console.error('Error creating inventory supplier:', error);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// PUT update inventory supplier
router.put('/inventory/suppliers/:id', async (req, res) => {
  try {
    const { error, value } = validateSupplier(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, contact_person, phone, email, address, notes } = value;
    const supplierId = req.params.id;

    // Check if supplier exists
    const existing = await db.query(
      'SELECT * FROM inventory_suppliers WHERE id = ?',
      [supplierId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Check for duplicate name (excluding current supplier)
    const duplicate = await db.query(
      'SELECT id FROM inventory_suppliers WHERE name = ? AND id != ?',
      [name, supplierId]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({ error: 'Supplier with this name already exists' });
    }

    await db.query(
      'UPDATE inventory_suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, contact_person || null, phone || null, email || null, address || null, notes || null, supplierId]
    );

    const updatedSupplier = await db.query(
      'SELECT * FROM inventory_suppliers WHERE id = ?',
      [supplierId]
    );

    await logInventoryAction(null, 'SUPPLIER_UPDATED', `Supplier updated: ${name}`, req.user?.id);
    
    res.json(updatedSupplier[0]);
  } catch (error) {
    console.error('Error updating inventory supplier:', error);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// DELETE inventory supplier
router.delete('/inventory/suppliers/:id', async (req, res) => {
  try {
    const supplierId = req.params.id;

    // Check if supplier exists
    const existing = await db.query(
      'SELECT * FROM inventory_suppliers WHERE id = ?',
      [supplierId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Check if supplier has items
    const items = await db.query(
      'SELECT id FROM inventory_items WHERE supplier_id = ?',
      [supplierId]
    );

    if (items.length > 0) {
      return res.status(400).json({ error: 'Cannot delete supplier with existing items. Reassign items to another supplier first.' });
    }

    await db.query('DELETE FROM inventory_suppliers WHERE id = ?', [supplierId]);
    
    await logInventoryAction(null, 'SUPPLIER_DELETED', `Supplier deleted: ${existing[0].name}`, req.user?.id);
    
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory supplier:', error);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

// =================== INVENTORY ITEMS ===================

// GET all inventory items with pagination and filtering
router.get('/inventory/items', async (req, res) => {
  try {
    const { page = 1, limit = 50, category_id, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name,
             (SELECT COUNT(*) FROM inventory_adjustments WHERE item_id = i.id) as adjustment_count
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      query += ' AND i.category_id = ?';
      params.push(category_id);
    }

    if (status === 'low-stock') {
      query += ' AND i.stock_quantity <= i.low_stock_threshold AND i.stock_quantity > 0';
    } else if (status === 'out-of-stock') {
      query += ' AND i.stock_quantity = 0';
    } else if (status === 'in-stock') {
      query += ' AND i.stock_quantity > i.low_stock_threshold';
    }

    if (search) {
      query += ' AND (i.name LIKE ? OR c.name LIKE ? OR s.name LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY i.name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const items = await db.query(query, params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM inventory_items i LEFT JOIN inventory_categories c ON i.category_id = c.id LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id WHERE 1=1';
    const countParams = [];
    
    if (category_id) {
      countQuery += ' AND i.category_id = ?';
      countParams.push(category_id);
    }
    
    if (status === 'low-stock') {
      countQuery += ' AND i.stock_quantity <= i.low_stock_threshold AND i.stock_quantity > 0';
    } else if (status === 'out-of-stock') {
      countQuery += ' AND i.stock_quantity = 0';
    } else if (status === 'in-stock') {
      countQuery += ' AND i.stock_quantity > i.low_stock_threshold';
    }
    
    if (search) {
      countQuery += ' AND (i.name LIKE ? OR c.name LIKE ? OR s.name LIKE ?)';
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// GET inventory item by ID
router.get('/inventory/items/:id', async (req, res) => {
  try {
    const items = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `, [req.params.id]);
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(items[0]);
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// POST create inventory item
router.post('/inventory/items', async (req, res) => {
  try {
    const { error, value } = validateInventoryItem(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, category_id, stock_quantity, low_stock_threshold, cost_price, selling_price, unit, supplier_id, description } = value;
    
    // Check if item already exists
    const existing = await db.query(
      'SELECT id FROM inventory_items WHERE name = ?',
      [name]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Item with this name already exists' });
    }

    // Validate category exists
    const category = await db.query(
      'SELECT id FROM inventory_categories WHERE id = ?',
      [category_id]
    );
    
    if (category.length === 0) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }

    // Validate supplier exists (if provided)
    if (supplier_id) {
      const supplier = await db.query(
        'SELECT id FROM inventory_suppliers WHERE id = ?',
        [supplier_id]
      );
      
      if (supplier.length === 0) {
        return res.status(400).json({ error: 'Invalid supplier ID' });
      }
    }

    const result = await db.query(`
      INSERT INTO inventory_items 
      (name, category_id, stock_quantity, low_stock_threshold, cost_price, selling_price, unit, supplier_id, description, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [name, category_id, stock_quantity || 0, low_stock_threshold || 5, cost_price || 0, selling_price || 0, unit || 'piece', supplier_id || null, description || null]);

    const newItem = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `, [result.insertId]);

    await logInventoryAction(newItem[0].id, 'ITEM_CREATED', `Item created: ${name}`, req.user?.id);
    
    res.status(201).json(newItem[0]);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT update inventory item
router.put('/inventory/items/:id', async (req, res) => {
  try {
    const { error, value } = validateInventoryItem(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, category_id, stock_quantity, low_stock_threshold, cost_price, selling_price, unit, supplier_id, description } = value;
    const itemId = req.params.id;

    // Check if item exists
    const existing = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `, [itemId]);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check for duplicate name (excluding current item)
    const duplicate = await db.query(
      'SELECT id FROM inventory_items WHERE name = ? AND id != ?',
      [name, itemId]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({ error: 'Item with this name already exists' });
    }

    // Validate category exists
    const category = await db.query(
      'SELECT id FROM inventory_categories WHERE id = ?',
      [category_id]
    );
    
    if (category.length === 0) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }

    // Validate supplier exists (if provided)
    if (supplier_id) {
      const supplier = await db.query(
        'SELECT id FROM inventory_suppliers WHERE id = ?',
        [supplier_id]
      );
      
      if (supplier.length === 0) {
        return res.status(400).json({ error: 'Invalid supplier ID' });
      }
    }

    await db.query(`
      UPDATE inventory_items 
      SET name = ?, category_id = ?, stock_quantity = ?, low_stock_threshold = ?, 
          cost_price = ?, selling_price = ?, unit = ?, supplier_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, category_id, stock_quantity || 0, low_stock_threshold || 5, cost_price || 0, selling_price || 0, unit || 'piece', supplier_id || null, description || null, itemId]);

    const updatedItem = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `, [itemId]);

    await logInventoryAction(itemId, 'ITEM_UPDATED', `Item updated: ${name}`, req.user?.id);
    
    res.json(updatedItem[0]);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE inventory item
router.delete('/inventory/items/:id', async (req, res) => {
  try {
    const itemId = req.params.id;

    // Check if item exists
    const existing = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `, [itemId]);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await db.query('DELETE FROM inventory_items WHERE id = ?', [itemId]);
    
    await logInventoryAction(itemId, 'ITEM_DELETED', `Item deleted: ${existing[0].name}`, req.user?.id);
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// =================== STOCK MANAGEMENT ===================

// GET low stock items
router.get('/inventory/low-stock', async (req, res) => {
  try {
    const items = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.stock_quantity <= i.low_stock_threshold AND i.stock_quantity > 0
      ORDER BY i.stock_quantity ASC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

// GET out of stock items
router.get('/inventory/out-of-stock', async (req, res) => {
  try {
    const items = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.stock_quantity = 0
      ORDER BY i.updated_at DESC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching out of stock items:', error);
    res.status(500).json({ error: 'Failed to fetch out of stock items' });
  }
});

// POST adjust stock for an item
router.post('/inventory/:id/adjust', async (req, res) => {
  try {
    const { error, value } = validateStockAdjustment(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const itemId = req.params.id;
    const { type, quantity, reason } = value;

    // Check if item exists
    const existing = await db.query('SELECT * FROM inventory_items WHERE id = ?', [itemId]);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = existing[0];
    let newStockQuantity;

    switch (type) {
      case 'add':
        newStockQuantity = item.stock_quantity + quantity;
        break;
      case 'remove':
        newStockQuantity = Math.max(0, item.stock_quantity - quantity);
        break;
      case 'set':
        newStockQuantity = quantity;
        break;
      default:
        return res.status(400).json({ error: 'Invalid adjustment type' });
    }

    // Update item stock
    await db.query(
      'UPDATE inventory_items SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStockQuantity, itemId]
    );

    // Log the adjustment
    await db.query(`
      INSERT INTO inventory_adjustments 
      (item_id, type, quantity, reason, previous_quantity, new_quantity, adjusted_by, adjusted_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [itemId, type, quantity, reason, item.stock_quantity, newStockQuantity, req.user?.id]);

    // Get updated item
    const updatedItem = await db.query(`
      SELECT i.*, 
             c.name as category_name,
             s.name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `, [itemId]);

    await logInventoryAction(itemId, 'STOCK_ADJUSTED', `${type.toUpperCase()}: ${quantity} units. Reason: ${reason}`, req.user?.id);
    
    res.json({
      message: 'Stock adjusted successfully',
      item: updatedItem[0],
      adjustment: {
        type,
        quantity,
        reason,
        previous_quantity: item.stock_quantity,
        new_quantity: newStockQuantity
      }
    });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// GET stock adjustment history for an item
router.get('/inventory/:id/history', async (req, res) => {
  try {
    const itemId = req.params.id;

    // Check if item exists
    const existing = await db.query('SELECT id FROM inventory_items WHERE id = ?', [itemId]);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const history = await db.query(`
      SELECT a.*, 
             u.username as adjusted_by_name
      FROM inventory_adjustments a
      LEFT JOIN users u ON a.adjusted_by = u.id
      WHERE a.item_id = ?
      ORDER BY a.adjusted_at DESC
    `, [itemId]);

    res.json(history);
  } catch (error) {
    console.error('Error fetching stock history:', error);
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
});

// =================== INVENTORY STATISTICS ===================

// GET inventory statistics
router.get('/inventory/stats', async (req, res) => {
  try {
    // Get total items
    const totalItemsResult = await db.query('SELECT COUNT(*) as count FROM inventory_items');
    const totalItems = totalItemsResult[0].count;

    // Get low stock items
    const lowStockResult = await db.query(`
      SELECT COUNT(*) as count FROM inventory_items 
      WHERE stock_quantity <= low_stock_threshold AND stock_quantity > 0
    `);
    const lowStockCount = lowStockResult[0].count;

    // Get out of stock items
    const outOfStockResult = await db.query('SELECT COUNT(*) as count FROM inventory_items WHERE stock_quantity = 0');
    const outOfStockCount = outOfStockResult[0].count;

    // Get total inventory value
    const valueResult = await db.query('SELECT SUM(stock_quantity * cost_price) as total_value FROM inventory_items');
    const totalValue = valueResult[0].total_value || 0;

    // Get recent adjustments
    const recentAdjustmentsResult = await db.query(`
      SELECT COUNT(*) as count FROM inventory_adjustments 
      WHERE adjusted_at >= datetime('now', '-30 days')
    `);
    const recentAdjustments = recentAdjustmentsResult[0].count;

    // Get categories count
    const categoriesResult = await db.query('SELECT COUNT(*) as count FROM inventory_categories');
    const categoriesCount = categoriesResult[0].count;

    // Get suppliers count
    const suppliersResult = await db.query('SELECT COUNT(*) as count FROM inventory_suppliers');
    const suppliersCount = suppliersResult[0].count;

    res.json({
      totalItems,
      lowStockCount,
      outOfStockCount,
      totalValue: parseFloat(totalValue.toFixed(2)),
      recentAdjustments,
      categoriesCount,
      suppliersCount
    });
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    res.status(500).json({ error: 'Failed to fetch inventory statistics' });
  }
});

// GET inventory summary by category
router.get('/inventory/summary/category', async (req, res) => {
  try {
    const summary = await db.query(`
      SELECT c.name as category_name,
             COUNT(i.id) as item_count,
             SUM(i.stock_quantity) as total_stock,
             SUM(i.stock_quantity * i.cost_price) as total_value,
             SUM(CASE WHEN i.stock_quantity <= i.low_stock_threshold AND i.stock_quantity > 0 THEN 1 ELSE 0 END) as low_stock_items,
             SUM(CASE WHEN i.stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_items
      FROM inventory_categories c
      LEFT JOIN inventory_items i ON c.id = i.category_id
      GROUP BY c.id, c.name
      ORDER BY total_value DESC
    `);
    res.json(summary);
  } catch (error) {
    console.error('Error fetching inventory summary by category:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

// GET inventory turnover analysis
router.get('/inventory/turnover', async (req, res) => {
  try {
    const turnover = await db.query(`
      SELECT i.name as item_name,
             c.name as category_name,
             i.stock_quantity,
             i.low_stock_threshold,
             i.cost_price,
             i.selling_price,
             (SELECT COUNT(*) FROM inventory_adjustments WHERE item_id = i.id AND type = 'add' AND adjusted_at >= datetime('now', '-30 days')) as additions_last_30_days,
             (SELECT COUNT(*) FROM inventory_adjustments WHERE item_id = i.id AND type = 'remove' AND adjusted_at >= datetime('now', '-30 days')) as removals_last_30_days,
             (SELECT COUNT(*) FROM inventory_adjustments WHERE item_id = i.id AND adjusted_at >= datetime('now', '-30 days')) as total_adjustments_last_30_days
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      ORDER BY total_adjustments_last_30_days DESC
    `);
    res.json(turnover);
  } catch (error) {
    console.error('Error fetching inventory turnover:', error);
    res.status(500).json({ error: 'Failed to fetch inventory turnover' });
  }
});

// =================== INVENTORY IMPORT/EXPORT ===================

// POST import inventory from CSV
router.post('/inventory/import', async (req, res) => {
  try {
    const { update_existing = false, validate_only = false } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse CSV file (you'll need to install csv-parser)
    const csv = require('csv-parser');
    const fs = require('fs');
    const path = require('path');

    const results = [];
    const filePath = path.join(__dirname, 'uploads', file.filename);

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    // Validate and process data
    const preview = [];
    const errors = [];
    let successCount = 0;
    let updateCount = 0;

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const rowIndex = i + 1;

      try {
        // Validate required fields
        if (!row.name || !row.category_name) {
          errors.push({ row: rowIndex, message: 'Name and category_name are required' });
          continue;
        }

        // Find category
        const categories = await db.query('SELECT id FROM inventory_categories WHERE name = ?', [row.category_name]);
        if (categories.length === 0) {
          errors.push({ row: rowIndex, message: `Category "${row.category_name}" not found` });
          continue;
        }
        const categoryId = categories[0].id;

        // Find supplier (if provided)
        let supplierId = null;
        if (row.supplier_name) {
          const suppliers = await db.query('SELECT id FROM inventory_suppliers WHERE name = ?', [row.supplier_name]);
          if (suppliers.length === 0) {
            errors.push({ row: rowIndex, message: `Supplier "${row.supplier_name}" not found` });
            continue;
          }
          supplierId = suppliers[0].id;
        }

        // Check if item exists
        const existing = await db.query('SELECT id FROM inventory_items WHERE name = ?', [row.name]);

        if (existing.length > 0 && !update_existing) {
          errors.push({ row: rowIndex, message: `Item "${row.name}" already exists. Use update_existing=true to update it.` });
          continue;
        }

        const itemData = {
          name: row.name,
          category_id: categoryId,
          stock_quantity: parseInt(row.stock_quantity) || 0,
          low_stock_threshold: parseInt(row.low_stock_threshold) || 5,
          cost_price: parseFloat(row.cost_price) || 0,
          selling_price: parseFloat(row.selling_price) || 0,
          unit: row.unit || 'piece',
          supplier_id: supplierId,
          description: row.description || null
        };

        preview.push({
          ...itemData,
          exists: existing.length > 0,
          row: rowIndex
        });

      } catch (error) {
        errors.push({ row: rowIndex, message: error.message });
      }
    }

    if (validate_only) {
      return res.json({
        preview,
        errors,
        summary: {
          total_rows: results.length,
          valid_rows: preview.length,
          error_rows: errors.length
        }
      });
    }

    // Process import
    for (const item of preview) {
      try {
        if (item.exists) {
          // Update existing item
          await db.query(`
            UPDATE inventory_items 
            SET category_id = ?, stock_quantity = ?, low_stock_threshold = ?, 
                cost_price = ?, selling_price = ?, unit = ?, supplier_id = ?, description = ?
            WHERE name = ?
          `, [item.category_id, item.stock_quantity, item.low_stock_threshold, item.cost_price, item.selling_price, item.unit, item.supplier_id, item.description, item.name]);
          updateCount++;
        } else {
          // Create new item
          await db.query(`
            INSERT INTO inventory_items 
            (name, category_id, stock_quantity, low_stock_threshold, cost_price, selling_price, unit, supplier_id, description, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `, [item.name, item.category_id, item.stock_quantity, item.low_stock_threshold, item.cost_price, item.selling_price, item.unit, item.supplier_id, item.description]);
          successCount++;
        }
      } catch (error) {
        errors.push({ row: item.row, message: `Failed to process: ${error.message}` });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    await logInventoryAction(null, 'IMPORT_COMPLETED', `Import completed: ${successCount} created, ${updateCount} updated, ${errors.length} errors`, req.user?.id);

    res.json({
      success: true,
      message: 'Import completed successfully',
      summary: {
        created: successCount,
        updated: updateCount,
        errors: errors.length
      },
      errors
    });

  } catch (error) {
    console.error('Error importing inventory:', error);
    res.status(500).json({ error: 'Failed to import inventory data' });
  }
});

// GET export inventory data
router.get('/inventory/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    let query = '';
    let filename = '';

    switch (type) {
      case 'all':
        query = `
          SELECT i.name, c.name as category_name, i.stock_quantity, i.low_stock_threshold, 
                 i.cost_price, i.selling_price, i.unit, s.name as supplier_name, i.description
          FROM inventory_items i
          LEFT JOIN inventory_categories c ON i.category_id = c.id
          LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
          ORDER BY c.name, i.name
        `;
        filename = 'inventory-all.csv';
        break;
      case 'low-stock':
        query = `
          SELECT i.name, c.name as category_name, i.stock_quantity, i.low_stock_threshold, 
                 i.cost_price, i.selling_price, i.unit, s.name as supplier_name, i.description
          FROM inventory_items i
          LEFT JOIN inventory_categories c ON i.category_id = c.id
          LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
          WHERE i.stock_quantity <= i.low_stock_threshold AND i.stock_quantity > 0
          ORDER BY i.stock_quantity ASC
        `;
        filename = 'inventory-low-stock.csv';
        break;
      case 'out-of-stock':
        query = `
          SELECT i.name, c.name as category_name, i.stock_quantity, i.low_stock_threshold, 
                 i.cost_price, i.selling_price, i.unit, s.name as supplier_name, i.description
          FROM inventory_items i
          LEFT JOIN inventory_categories c ON i.category_id = c.id
          LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id
          WHERE i.stock_quantity = 0
          ORDER BY i.updated_at DESC
        `;
        filename = 'inventory-out-of-stock.csv';
        break;
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    const data = await db.query(query);

    // Convert to CSV
    const csv = require('csv-writer').createObjectCsvWriter;
    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'temp', filename);

    const csvWriter = csv({
      path: tempFile,
      header: [
        { id: 'name', title: 'Name' },
        { id: 'category_name', title: 'Category' },
        { id: 'stock_quantity', title: 'Stock Quantity' },
        { id: 'low_stock_threshold', title: 'Low Stock Threshold' },
        { id: 'cost_price', title: 'Cost Price' },
        { id: 'selling_price', title: 'Selling Price' },
        { id: 'unit', title: 'Unit' },
        { id: 'supplier_name', title: 'Supplier' },
        { id: 'description', title: 'Description' }
      ]
    });

    await csvWriter.writeRecords(data);

    res.download(tempFile, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
      // Clean up temp file
      fs.unlinkSync(tempFile);
    });

  } catch (error) {
    console.error('Error exporting inventory:', error);
    res.status(500).json({ error: 'Failed to export inventory data' });
  }
});

// GET export inventory template
router.get('/inventory/export/template', async (req, res) => {
  try {
    const headers = [
      'name,category_name,stock_quantity,low_stock_threshold,cost_price,selling_price,unit,supplier_name,description'
    ];
    const csvContent = headers.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-template.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting template:', error);
    res.status(500).json({ error: 'Failed to export template' });
  }
});

module.exports = router;
