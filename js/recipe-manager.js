// Recipe/BOM Manager for Cafe POS
// Handles recipe creation, ingredient tracking, cost calculation, and inventory deductions

class RecipeManager {
  constructor(db, inventoryManager) {
    this.db = db;
    this.inventoryManager = inventoryManager;
  }

  // Initialize recipe system
  async init() {
    try {
      // Create recipes table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS recipes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
        )
      `);

      // Create recipe_ingredients table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS recipe_ingredients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipe_id INTEGER NOT NULL,
          menu_item_id INTEGER NOT NULL,
          quantity REAL NOT NULL,
          unit TEXT DEFAULT 'gram' CHECK (unit IN ('gram', 'kilogram', 'milliliter', 'liter', 'piece', 'count', 'ounce', 'pound')),
          is_required INTEGER DEFAULT 1,
          is_modifier INTEGER DEFAULT 0,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        )
      `);

      // Create recipe_usage_history table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS recipe_usage_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipe_id INTEGER NOT NULL,
          order_id INTEGER NOT NULL,
          order_item_id INTEGER NOT NULL,
          quantity_used INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (recipe_id) REFERENCES recipes(id),
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (order_item_id) REFERENCES order_items(id)
        )
      `);

      // Create ingredient_conversion_rates table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ingredient_conversion_rates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id INTEGER UNIQUE NOT NULL,
          base_unit TEXT NOT NULL CHECK (base_unit IN ('gram', 'kilogram', 'milliliter', 'liter', 'piece', 'count', 'ounce', 'pound')),
          conversion_factor REAL NOT NULL DEFAULT 1.0,
          servings_per_unit REAL NOT NULL DEFAULT 1.0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
        )
      `);

      // Add recipe fields to menu_items if not exists
      this.db.run(`
        ALTER TABLE menu_items 
        ADD COLUMN IF NOT EXISTS recipe_id INTEGER
      `);
      this.db.run(`
        ALTER TABLE menu_items 
        ADD COLUMN IF NOT EXISTS is_recipe_based INTEGER DEFAULT 0
      `);
      this.db.run(`
        ALTER TABLE menu_items 
        ADD COLUMN IF NOT EXISTS recipe_cost REAL DEFAULT 0.0
      `);
      this.db.run(`
        ALTER TABLE menu_items 
        ADD COLUMN IF NOT EXISTS last_recipe_cost_update DATETIME
      `);

      // Add recipe_id to order_items if not exists
      this.db.run(`
        ALTER TABLE order_items 
        ADD COLUMN IF NOT EXISTS recipe_id INTEGER
      `);

      // Create recipe_ingredient_alerts table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS recipe_ingredient_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipe_id INTEGER NOT NULL,
          ingredient_id INTEGER NOT NULL,
          alert_type TEXT NOT NULL,
          message TEXT NOT NULL,
          is_resolved INTEGER DEFAULT 0,
          resolved_at DATETIME,
          resolved_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (recipe_id) REFERENCES recipes(id),
          FOREIGN KEY (ingredient_id) REFERENCES menu_items(id),
          FOREIGN KEY (resolved_by) REFERENCES users(id)
        )
      `);

      console.log('Recipe Management System initialized');
    } catch (error) {
      console.error('Error initializing recipe manager:', error);
      throw error;
    }
  }

  // Helper to convert result to objects
  _resultToObjects(result) {
    if (!result || result.length === 0) return [];
    const columns = result[0].columns;
    const values = result[0].values;
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  // ==================== RECIPE MANAGEMENT ====================

  // Create a new recipe
  async createRecipe(recipeData, userId) {
    const result = this.db.prepare(`
      INSERT INTO recipes 
      (menu_item_id, name, description, is_active)
      VALUES (?, ?, ?, ?)
    `).run(
      recipeData.menu_item_id,
      recipeData.name,
      recipeData.description || null,
      recipeData.is_active !== false ? 1 : 0
    );

    const recipeId = result.lastInsertRowid;

    // Update menu item to mark it as recipe-based
    await this.db.run(`
      UPDATE menu_items SET 
        recipe_id = ?,
        is_recipe_based = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [recipeId, recipeData.menu_item_id]);

    // Calculate and update recipe cost
    await this.calculateRecipeCost(recipeId);

    return this.getRecipe(recipeId);
  }

  // Get recipe by ID
  async getRecipe(recipeId) {
    const result = this.db.exec('SELECT * FROM recipes WHERE id = ?', [recipeId]);
    const recipes = this._resultToObjects(result);
    const recipe = recipes[0] || null;

    if (recipe) {
      // Get ingredients
      const ingredientsResult = this.db.exec('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY display_order', [recipeId]);
      recipe.ingredients = this._resultToObjects(ingredientsResult);

      // Get menu item details
      const menuItemResult = this.db.exec('SELECT id, name, price FROM menu_items WHERE id = ?', [recipe.menu_item_id]);
      const menuItems = this._resultToObjects(menuItemResult);
      recipe.menu_item = menuItems[0] || null;
    }

    return recipe;
  }

  // Get all recipes
  async getAllRecipes(activeOnly = true) {
    let query = 'SELECT * FROM recipes';
    const params = [];

    if (activeOnly) {
      query += ' WHERE is_active = 1';
    }

    query += ' ORDER BY name ASC';

    const result = this.db.exec(query, params);
    const recipes = this._resultToObjects(result);

    // Enrich with menu item and ingredient details
    for (const recipe of recipes) {
      const menuItemResult = this.db.exec('SELECT id, name, price FROM menu_items WHERE id = ?', [recipe.menu_item_id]);
      const menuItems = this._resultToObjects(menuItemResult);
      recipe.menu_item = menuItems[0] || null;

      const ingredientsResult = this.db.exec('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY display_order', [recipe.id]);
      recipe.ingredients = this._resultToObjects(ingredientsResult);
    }

    return recipes;
  }

  // Update recipe
  async updateRecipe(recipeId, recipeData, userId) {
    this.db.run(`
      UPDATE recipes SET 
        name = ?,
        description = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      recipeData.name,
      recipeData.description || null,
      recipeData.is_active !== false ? 1 : 0,
      recipeId
    ]);

    // Recalculate recipe cost if ingredients changed
    if (recipeData.ingredients) {
      await this.updateRecipeIngredients(recipeId, recipeData.ingredients);
      await this.calculateRecipeCost(recipeId);
    }

    return this.getRecipe(recipeId);
  }

  // Delete recipe (soft delete)
  async deleteRecipe(recipeId, userId) {
    // Get recipe first to update menu item
    const recipe = await this.getRecipe(recipeId);
    if (!recipe) {
      throw new Error('Recipe not found');
    }

    // Update menu item to remove recipe association
    await this.db.run(`
      UPDATE menu_items SET 
        recipe_id = NULL,
        is_recipe_based = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [recipe.menu_item_id]);

    // Soft delete recipe
    this.db.run('UPDATE recipes SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [recipeId]);

    return { success: true, message: 'Recipe deactivated successfully' };
  }

  // ==================== RECIPE INGREDIENTS ====================

  // Add ingredient to recipe
  async addRecipeIngredient(recipeId, ingredientData) {
    const result = this.db.prepare(`
      INSERT INTO recipe_ingredients 
      (recipe_id, menu_item_id, quantity, unit, is_required, is_modifier, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipeId,
      ingredientData.menu_item_id,
      ingredientData.quantity,
      ingredientData.unit || 'gram',
      ingredientData.is_required !== false ? 1 : 0,
      ingredientData.is_modifier || 0,
      ingredientData.display_order || 0
    );

    const ingredientId = result.lastInsertRowid;

    // Recalculate recipe cost
    await this.calculateRecipeCost(recipeId);

    return this.getRecipeIngredient(ingredientId);
  }

  // Get recipe ingredient by ID
  async getRecipeIngredient(ingredientId) {
    const result = this.db.exec('SELECT * FROM recipe_ingredients WHERE id = ?', [ingredientId]);
    const ingredients = this._resultToObjects(result);
    return ingredients[0] || null;
  }

  // Update recipe ingredients (replace all)
  async updateRecipeIngredients(recipeId, ingredients) {
    // Clear existing ingredients
    await this.db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);

    // Add new ingredients
    for (const ingredient of ingredients) {
      await this.addRecipeIngredient(recipeId, ingredient);
    }

    return { success: true, message: 'Recipe ingredients updated successfully' };
  }

  // Update recipe ingredient
  async updateRecipeIngredient(ingredientId, ingredientData) {
    this.db.run(`
      UPDATE recipe_ingredients SET 
        quantity = ?,
        unit = ?,
        is_required = ?,
        is_modifier = ?,
        display_order = ?
      WHERE id = ?
    `, [
      ingredientData.quantity,
      ingredientData.unit || 'gram',
      ingredientData.is_required !== false ? 1 : 0,
      ingredientData.is_modifier || 0,
      ingredientData.display_order || 0,
      ingredientId
    ]);

    // Get recipe ID
    const ingredient = await this.getRecipeIngredient(ingredientId);
    if (ingredient) {
      // Recalculate recipe cost
      await this.calculateRecipeCost(ingredient.recipe_id);
    }

    return this.getRecipeIngredient(ingredientId);
  }

  // Delete recipe ingredient
  async deleteRecipeIngredient(ingredientId) {
    const ingredient = await this.getRecipeIngredient(ingredientId);
    if (!ingredient) {
      throw new Error('Ingredient not found');
    }

    await this.db.run('DELETE FROM recipe_ingredients WHERE id = ?', [ingredientId]);

    // Recalculate recipe cost
    await this.calculateRecipeCost(ingredient.recipe_id);

    return { success: true, message: 'Ingredient deleted successfully' };
  }

  // ==================== INGREDIENT CONVERSION RATES ====================

  // Set conversion rate for ingredient
  async setConversionRate(menuItemId, conversionData) {
    const existingResult = this.db.exec('SELECT id FROM ingredient_conversion_rates WHERE menu_item_id = ?', [menuItemId]);
    const exists = existingResult.length > 0 && existingResult[0].values.length > 0;

    if (exists) {
      await this.db.run(`
        UPDATE ingredient_conversion_rates SET 
          base_unit = ?,
          conversion_factor = ?,
          servings_per_unit = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE menu_item_id = ?
      `, [
        conversionData.base_unit,
        conversionData.conversion_factor || 1.0,
        conversionData.servings_per_unit || 1.0,
        menuItemId
      ]);
    } else {
      await this.db.run(`
        INSERT INTO ingredient_conversion_rates 
        (menu_item_id, base_unit, conversion_factor, servings_per_unit)
        VALUES (?, ?, ?, ?)
      `, [
        menuItemId,
        conversionData.base_unit,
        conversionData.conversion_factor || 1.0,
        conversionData.servings_per_unit || 1.0
      ]);
    }

    return { success: true, message: 'Conversion rate updated successfully' };
  }

  // Get conversion rate for ingredient
  async getConversionRate(menuItemId) {
    const result = this.db.exec('SELECT * FROM ingredient_conversion_rates WHERE menu_item_id = ?', [menuItemId]);
    const rates = this._resultToObjects(result);
    return rates[0] || null;
  }

  // ==================== RECIPE COST CALCULATION ====================

  // Calculate recipe cost
  async calculateRecipeCost(recipeId) {
    const recipe = await this.getRecipe(recipeId);
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return { cost: 0 };
    }

    let totalCost = 0;

    for (const ingredient of recipe.ingredients) {
      // Get ingredient menu item details
      const menuItemResult = this.db.exec('SELECT * FROM menu_items WHERE id = ?', [ingredient.menu_item_id]);
      const menuItems = this._resultToObjects(menuItemResult);
      const menuItem = menuItems[0];

      if (menuItem) {
        // Use ingredient cost if available, otherwise use menu item price
        const ingredientCost = menuItem.recipe_cost || menuItem.price || 0;
        const quantity = ingredient.quantity || 0;

        // Calculate cost for this ingredient
        const ingredientTotal = ingredientCost * quantity;
        totalCost += ingredientTotal;
      }
    }

    // Update menu item with recipe cost
    await this.db.run(`
      UPDATE menu_items SET 
        recipe_cost = ?,
        last_recipe_cost_update = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [totalCost, recipe.menu_item_id]);

    return { cost: totalCost };
  }

  // Calculate cost for a specific quantity
  async calculateRecipeCostForQuantity(recipeId, quantity) {
    const recipe = await this.getRecipe(recipeId);
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return { cost: 0 };
    }

    let totalCost = 0;

    for (const ingredient of recipe.ingredients) {
      const menuItemResult = this.db.exec('SELECT * FROM menu_items WHERE id = ?', [ingredient.menu_item_id]);
      const menuItems = this._resultToObjects(menuItemResult);
      const menuItem = menuItems[0];

      if (menuItem) {
        const ingredientCost = menuItem.recipe_cost || menuItem.price || 0;
        const ingredientQuantity = ingredient.quantity || 0;
        const totalIngredientQuantity = ingredientQuantity * quantity;

        const ingredientTotal = ingredientCost * totalIngredientQuantity;
        totalCost += ingredientTotal;
      }
    }

    return { cost: totalCost };
  }

  // ==================== INVENTORY DEDUCTION ====================

  // Deduct ingredients from inventory for a recipe
  async deductIngredientsFromInventory(recipeId, quantity, orderId = null, orderItemId = null) {
    const recipe = await this.getRecipe(recipeId);
    if (!recipe || !recipe.ingredients) {
      throw new Error('Recipe not found or has no ingredients');
    }

    const deductions = [];

    for (const ingredient of recipe.ingredients) {
      // Get ingredient menu item details
      const menuItemResult = this.db.exec('SELECT * FROM menu_items WHERE id = ?', [ingredient.menu_item_id]);
      const menuItems = this._resultToObjects(menuItemResult);
      const menuItem = menuItems[0];

      if (menuItem) {
        // Check if ingredient is weighted
        const isWeighted = menuItem.is_weighted === 1;

        if (isWeighted) {
          // Handle weighted ingredients
          const weightUsed = ingredient.quantity * quantity;
          try {
            const result = await this.inventoryManager.updateWeightAfterSale(
              ingredient.menu_item_id,
              weightUsed,
              ingredient.unit || 'gram',
              orderId,
              orderItemId
            );
            deductions.push({
              ingredient_id: ingredient.menu_item_id,
              ingredient_name: menuItem.name,
              quantity_deduct: weightUsed,
              unit: ingredient.unit || 'gram',
              success: true,
              new_weight: result.newWeight
            });
          } catch (error) {
            deductions.push({
              ingredient_id: ingredient.menu_item_id,
              ingredient_name: menuItem.name,
              quantity_deduct: weightUsed,
              unit: ingredient.unit || 'gram',
              success: false,
              error: error.message
            });
          }
        } else {
          // Handle regular ingredients
          const quantityToDeduct = ingredient.quantity * quantity;

          // Check if there's enough stock
          if (menuItem.stock_quantity < quantityToDeduct) {
            deductions.push({
              ingredient_id: ingredient.menu_item_id,
              ingredient_name: menuItem.name,
              quantity_deduct: quantityToDeduct,
              unit: ingredient.unit || 'piece',
              success: false,
              error: 'Insufficient stock'
            });
            continue;
          }

          try {
            // Deduct from inventory
            await this.db.run(`
              UPDATE menu_items SET 
                stock_quantity = stock_quantity - ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [quantityToDeduct, ingredient.menu_item_id]);

            // Record inventory transaction
            await this.db.run(`
              INSERT INTO inventory_transactions 
              (menu_item_id, transaction_type, quantity, reason, created_by)
              VALUES (?, ?, ?, ?, ?)
            `, [
              ingredient.menu_item_id,
              'sale',
              -quantityToDeduct,
              `Recipe usage - ${recipe.name}`,
              orderId ? null : 1 // Use system user if no order
            ]);

            deductions.push({
              ingredient_id: ingredient.menu_item_id,
              ingredient_name: menuItem.name,
              quantity_deduct: quantityToDeduct,
              unit: ingredient.unit || 'piece',
              success: true,
              new_quantity: menuItem.stock_quantity - quantityToDeduct
            });
          } catch (error) {
            deductions.push({
              ingredient_id: ingredient.menu_item_id,
              ingredient_name: menuItem.name,
              quantity_deduct: quantityToDeduct,
              unit: ingredient.unit || 'piece',
              success: false,
              error: error.message
            });
          }
        }
      }
    }

    // Record recipe usage
    if (orderId && orderItemId) {
      await this.db.run(`
        INSERT INTO recipe_usage_history 
        (recipe_id, order_id, order_item_id, quantity_used)
        VALUES (?, ?, ?, ?)
      `, [recipeId, orderId, orderItemId, quantity]);
    }

    return deductions;
  }

  // Check if recipe has sufficient ingredients
  async checkIngredientAvailability(recipeId, quantity = 1) {
    const recipe = await this.getRecipe(recipeId);
    if (!recipe || !recipe.ingredients) {
      throw new Error('Recipe not found or has no ingredients');
    }

    const availability = [];
    let isAvailable = true;

    for (const ingredient of recipe.ingredients) {
      const menuItemResult = this.db.exec('SELECT * FROM menu_items WHERE id = ?', [ingredient.menu_item_id]);
      const menuItems = this._resultToObjects(menuItemResult);
      const menuItem = menuItems[0];

      if (menuItem) {
        const requiredQuantity = ingredient.quantity * quantity;
        const isWeighted = menuItem.is_weighted === 1;

        if (isWeighted) {
          // Check weighted ingredient
          const inventory = await this.inventoryManager.getWeightTracking(ingredient.menu_item_id);
          const available = inventory ? inventory.current_weight : 0;

          const hasEnough = available >= requiredQuantity;
          availability.push({
            ingredient_id: ingredient.menu_item_id,
            ingredient_name: menuItem.name,
            required_quantity: requiredQuantity,
            available_quantity: available,
            unit: ingredient.unit || 'gram',
            is_available: hasEnough
          });

          if (!hasEnough) {
            isAvailable = false;
          }
        } else {
          // Check regular ingredient
          const available = menuItem.stock_quantity || 0;
          const hasEnough = available >= requiredQuantity;

          availability.push({
            ingredient_id: ingredient.menu_item_id,
            ingredient_name: menuItem.name,
            required_quantity: requiredQuantity,
            available_quantity: available,
            unit: ingredient.unit || 'piece',
            is_available: hasEnough
          });

          if (!hasEnough) {
            isAvailable = false;
          }
        }
      }
    }

    return {
      is_available: isAvailable,
      availability_details: availability
    };
  }

  // ==================== RECIPE USAGE HISTORY ====================

  // Get recipe usage history
  async getRecipeUsageHistory(recipeId, limit = 50) {
    const query = `
      SELECT 
        ruh.*,
        o.order_number,
        oi.quantity as order_item_quantity,
        mi.name as menu_item_name
      FROM recipe_usage_history ruh
      JOIN orders o ON ruh.order_id = o.id
      JOIN order_items oi ON ruh.order_item_id = oi.id
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE ruh.recipe_id = ?
      ORDER BY ruh.created_at DESC
      LIMIT ?
    `;

    const result = this.db.exec(query, [recipeId, limit]);
    return this._resultToObjects(result);
  }

  // Get usage history for all recipes
  async getAllRecipeUsageHistory(limit = 50) {
    const query = `
      SELECT 
        ruh.*,
        r.name as recipe_name,
        o.order_number,
        oi.quantity as order_item_quantity,
        mi.name as menu_item_name
      FROM recipe_usage_history ruh
      JOIN recipes r ON ruh.recipe_id = r.id
      JOIN orders o ON ruh.order_id = o.id
      JOIN order_items oi ON ruh.order_item_id = oi.id
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      ORDER BY ruh.created_at DESC
      LIMIT ?
    `;

    const result = this.db.exec(query, [limit]);
    return this._resultToObjects(result);
  }

  // ==================== RECIPE ALERTS ====================

  // Create recipe ingredient alert
  async createRecipeIngredientAlert(recipeId, ingredientId, alertType, message, userId) {
    const result = this.db.prepare(`
      INSERT INTO recipe_ingredient_alerts 
      (recipe_id, ingredient_id, alert_type, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(recipeId, ingredientId, alertType, message, new Date().toISOString());

    const alertId = result.lastInsertRowid;
    return this.getRecipeIngredientAlert(alertId);
  }

  // Get recipe ingredient alert by ID
  async getRecipeIngredientAlert(alertId) {
    const result = this.db.exec('SELECT * FROM recipe_ingredient_alerts WHERE id = ?', [alertId]);
    const alerts = this._resultToObjects(result);
    return alerts[0] || null;
  }

  // Get all alerts for a recipe
  async getRecipeAlerts(recipeId, resolvedFilter = null) {
    let query = 'SELECT * FROM recipe_ingredient_alerts WHERE recipe_id = ?';
    const params = [recipeId];

    if (resolvedFilter !== null) {
      query += ' AND is_resolved = ?';
      params.push(resolvedFilter ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Resolve recipe ingredient alert
  async resolveRecipeIngredientAlert(alertId, userId) {
    this.db.run(`
      UPDATE recipe_ingredient_alerts SET 
        is_resolved = 1,
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by = ?
      WHERE id = ?
    `, [userId, alertId]);

    return { success: true, message: 'Alert resolved successfully' };
  }

  // Check for low stock alerts on recipes
  async checkLowStockAlerts() {
    const alerts = [];

    // Get all active recipes
    const recipes = await this.getAllRecipes(true);

    for (const recipe of recipes) {
      if (!recipe.ingredients) continue;

      for (const ingredient of recipe.ingredients) {
        const menuItemResult = this.db.exec('SELECT * FROM menu_items WHERE id = ?', [ingredient.menu_item_id]);
        const menuItems = this._resultToObjects(menuItemResult);
        const menuItem = menuItems[0];

        if (menuItem) {
          const isWeighted = menuItem.is_weighted === 1;
          let available = 0;

          if (isWeighted) {
            const inventory = await this.inventoryManager.getWeightTracking(ingredient.menu_item_id);
            available = inventory ? inventory.current_weight : 0;
          } else {
            available = menuItem.stock_quantity || 0;
          }

          // Check if below low stock threshold
          const lowStockThreshold = menuItem.low_stock_threshold || 5;
          if (available < lowStockThreshold) {
            const message = `Low stock: ${menuItem.name} has ${available} ${isWeighted ? (ingredient.unit || 'gram') : (ingredient.unit || 'piece')} remaining (threshold: ${lowStockThreshold})`;

            // Check if alert already exists
            const existingAlerts = await this.getRecipeAlerts(recipe.id, false);
            const existingAlert = existingAlerts.find(alert => 
              alert.ingredient_id === ingredient.menu_item_id && !alert.is_resolved
            );

            if (!existingAlert) {
              const alert = await this.createRecipeIngredientAlert(
                recipe.id,
                ingredient.menu_item_id,
                'low_stock',
                message,
                1 // System user
              );
              alerts.push(alert);
            }
          }
        }
      }
    }

    return alerts;
  }

  // ==================== REPORTING ====================

  // Get recipe cost report
  async getRecipeCostReport(startDate, endDate) {
    const query = `
      SELECT 
        r.id,
        r.name as recipe_name,
        mi.name as menu_item_name,
        mi.price as menu_item_price,
        r.recipe_cost,
        COUNT(ruh.id) as usage_count,
        SUM(ruh.quantity_used) as total_quantity_used
      FROM recipes r
      JOIN menu_items mi ON r.menu_item_id = mi.id
      LEFT JOIN recipe_usage_history ruh ON r.id = ruh.recipe_id
      WHERE r.is_active = 1
      GROUP BY r.id, r.name, mi.name, mi.price, r.recipe_cost
      ORDER BY total_quantity_used DESC
    `;

    const result = this.db.exec(query);
    return this._resultToObjects(result);
  }

  // Get ingredient usage report
  async getIngredientUsageReport(startDate, endDate, recipeId = null) {
    let query = `
      SELECT 
        mi.id as ingredient_id,
        mi.name as ingredient_name,
        SUM(ri.quantity * ruh.quantity_used) as total_quantity_used,
        SUM(mi.price * ri.quantity * ruh.quantity_used) as total_cost
      FROM recipe_usage_history ruh
      JOIN recipes r ON ruh.recipe_id = r.id
      JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      JOIN menu_items mi ON ri.menu_item_id = mi.id
    `;

    const params = [];

    if (recipeId) {
      query += ' WHERE r.id = ?';
      params.push(recipeId);
    }

    query += ' GROUP BY mi.id, mi.name ORDER BY total_quantity_used DESC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Get recipe efficiency report
  async getRecipeEfficiencyReport(startDate, endDate) {
    const query = `
      SELECT 
        r.id,
        r.name as recipe_name,
        mi.price as selling_price,
        r.recipe_cost,
        (mi.price - r.recipe_cost) as profit_per_item,
        COUNT(ruh.id) as items_sold,
        (mi.price - r.recipe_cost) * COUNT(ruh.id) as total_profit,
        (r.recipe_cost / mi.price) * 100 as cost_percentage
      FROM recipes r
      JOIN menu_items mi ON r.menu_item_id = mi.id
      LEFT JOIN recipe_usage_history ruh ON r.id = ruh.recipe_id
      WHERE r.is_active = 1
      GROUP BY r.id, r.name, mi.price, r.recipe_cost
      ORDER BY total_profit DESC
    `;

    const result = this.db.exec(query);
    return this._resultToObjects(result);
  }
}

module.exports = RecipeManager;
