// Combo/Meal Deals Manager for Cafe POS
// Handles combo creation, validation, pricing, and application

const ComboManager = {
    // Get all active combo deals
    getAllActiveCombos: async () => {
        try {
            const db = require('./database');
            const combos = await db.query(
                `SELECT cd.*, 
                        json_agg(
                            json_build_object(
                                'id', ci.id,
                                'menu_item_id', ci.menu_item_id,
                                'is_required', ci.is_required,
                                'min_quantity', ci.min_quantity,
                                'max_quantity', ci.max_quantity,
                                'display_order', ci.display_order,
                                'item_name', mi.name,
                                'item_price', mi.price
                            )
                        ) as items,
                        (SELECT json_agg(json_build_object('id', cp.id, 'price', cp.price, 'is_active', cp.is_active))
                         FROM combo_pricing cp WHERE cp.combo_id = cd.id AND cp.is_active = TRUE LIMIT 1) as pricing,
                        (SELECT json_agg(json_build_object('id', cr.id, 'restriction_type', cr.restriction_type, 'restriction_value', cr.restriction_value))
                         FROM combo_restrictions cr WHERE cr.combo_id = cd.id) as restrictions
                 FROM combo_deals cd
                 LEFT JOIN combo_items ci ON cd.id = ci.combo_id
                 LEFT JOIN menu_items mi ON ci.menu_item_id = mi.id
                 WHERE cd.is_active = TRUE
                 GROUP BY cd.id
                 ORDER BY cd.name`
            ).rows;
            
            return combos.map(combo => ({
                ...combo,
                items: combo.items || [],
                pricing: combo.pricing || [],
                restrictions: combo.restrictions || []
            }));
        } catch (error) {
            console.error('Error fetching combos:', error);
            throw error;
        }
    },
    
    // Get combo by ID
    getById: async (comboId) => {
        try {
            const db = require('./database');
            const result = await db.query(
                `SELECT cd.*, 
                        json_agg(
                            json_build_object(
                                'id', ci.id,
                                'menu_item_id', ci.menu_item_id,
                                'is_required', ci.is_required,
                                'min_quantity', ci.min_quantity,
                                'max_quantity', ci.max_quantity,
                                'display_order', ci.display_order,
                                'item_name', mi.name,
                                'item_price', mi.price
                            )
                        ) as items,
                        (SELECT json_agg(json_build_object('id', cp.id, 'price', cp.price, 'is_active', cp.is_active))
                         FROM combo_pricing cp WHERE cp.combo_id = cd.id AND cp.is_active = TRUE) as pricing,
                        (SELECT json_agg(json_build_object('id', cr.id, 'restriction_type', cr.restriction_type, 'restriction_value', cr.restriction_value))
                         FROM combo_restrictions cr WHERE cr.combo_id = cd.id) as restrictions
                 FROM combo_deals cd
                 LEFT JOIN combo_items ci ON cd.id = ci.combo_id
                 LEFT JOIN menu_items mi ON ci.menu_item_id = mi.id
                 WHERE cd.id = ? AND cd.is_active = TRUE
                 GROUP BY cd.id`,
                [comboId]
            );
            
            if (result.rows.length === 0) return null;
            
            const combo = result.rows[0];
            return {
                ...combo,
                items: combo.items || [],
                pricing: combo.pricing || [],
                restrictions: combo.restrictions || []
            };
        } catch (error) {
            console.error('Error fetching combo by ID:', error);
            throw error;
        }
    },
    
    // Create new combo deal
    createCombo: async (comboData) => {
        try {
            const db = require('./database');
            const {
                name,
                description,
                combo_code,
                min_quantity,
                max_quantity,
                allow_customization,
                has_discount,
                discount_type,
                discount_value,
                is_predefined
            } = comboData;
            
            if (!name) {
                throw new Error('Combo name is required');
            }
            
            const result = await db.query(
                `INSERT INTO combo_deals 
                 (name, description, combo_code, min_quantity, max_quantity, 
                  allow_customization, has_discount, discount_type, discount_value, is_predefined)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id`,
                [
                    name,
                    description || null,
                    combo_code || null,
                    min_quantity || 1,
                    max_quantity || null,
                    allow_customization !== false,
                    has_discount !== false,
                    discount_type || 'fixed',
                    discount_value || 0,
                    is_predefined !== false
                ]
            );
            
            return result.rows[0].id;
        } catch (error) {
            console.error('Error creating combo:', error);
            throw error;
        }
    },
    
    // Update combo deal
    updateCombo: async (comboId, comboData) => {
        try {
            const db = require('./database');
            const {
                name,
                description,
                combo_code,
                min_quantity,
                max_quantity,
                allow_customization,
                has_discount,
                discount_type,
                discount_value,
                is_predefined,
                is_active
            } = comboData;
            
            await db.query(
                `UPDATE combo_deals 
                 SET name = ?, description = ?, combo_code = ?, min_quantity = ?, max_quantity = ?, 
                     allow_customization = ?, has_discount = ?, discount_type = ?, discount_value = ?, 
                     is_predefined = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    name,
                    description || null,
                    combo_code || null,
                    min_quantity || 1,
                    max_quantity || null,
                    allow_customization !== false,
                    has_discount !== false,
                    discount_type || 'fixed',
                    discount_value || 0,
                    is_predefined !== false,
                    is_active !== false,
                    comboId
                ]
            );
            
            return comboId;
        } catch (error) {
            console.error('Error updating combo:', error);
            throw error;
        }
    },
    
    // Add item to combo
    addItemToCombo: async (comboId, menuItemId, isRequired = true, minQuantity = 1, maxQuantity = null, displayOrder = 0) => {
        try {
            const db = require('./database');
            
            // Check if combo exists
            const combo = await db.query(`SELECT * FROM combo_deals WHERE id = ?`, [comboId]).rows[0];
            if (!combo) {
                throw new Error('Combo not found');
            }
            
            // Check if menu item exists
            const menuItem = await db.query(`SELECT * FROM menu_items WHERE id = ?`, [menuItemId]).rows[0];
            if (!menuItem) {
                throw new Error('Menu item not found');
            }
            
            // Check if item already exists in combo
            const existing = await db.query(
                `SELECT * FROM combo_items WHERE combo_id = ? AND menu_item_id = ?`,
                [comboId, menuItemId]
            ).rows[0];
            
            if (existing) {
                throw new Error('Item already exists in this combo');
            }
            
            await db.query(
                `INSERT INTO combo_items (combo_id, menu_item_id, is_required, min_quantity, max_quantity, display_order)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [comboId, menuItemId, isRequired, minQuantity, maxQuantity, displayOrder]
            );
            
            return true;
        } catch (error) {
            console.error('Error adding item to combo:', error);
            throw error;
        }
    },
    
    // Update combo item
    updateComboItem: async (itemId, updates) => {
        try {
            const db = require('./database');
            
            const {
                is_required,
                min_quantity,
                max_quantity,
                display_order
            } = updates;
            
            await db.query(
                `UPDATE combo_items 
                 SET is_required = ?, min_quantity = ?, max_quantity = ?, display_order = ? 
                 WHERE id = ?`,
                [
                    is_required !== false,
                    min_quantity || 1,
                    max_quantity || null,
                    display_order || 0,
                    itemId
                ]
            );
            
            return true;
        } catch (error) {
            console.error('Error updating combo item:', error);
            throw error;
        }
    },
    
    // Remove item from combo
    removeItemFromCombo: async (itemId) => {
        try {
            const db = require('./database');
            
            await db.query(`DELETE FROM combo_items WHERE id = ?`, [itemId]);
            
            return true;
        } catch (error) {
            console.error('Error removing item from combo:', error);
            throw error;
        }
    },
    
    // Set combo pricing
    setComboPricing: async (comboId, price, validFrom = null, validTo = null) => {
        try {
            const db = require('./database');
            
            // Deactivate existing pricing
            await db.query(`UPDATE combo_pricing SET is_active = FALSE WHERE combo_id = ?`, [comboId]);
            
            // Create new pricing
            await db.query(
                `INSERT INTO combo_pricing (combo_id, price, is_active, valid_from, valid_to) 
                 VALUES (?, ?, ?, ?, ?)`,
                [comboId, price, true, validFrom, validTo]
            );
            
            return true;
        } catch (error) {
            console.error('Error setting combo pricing:', error);
            throw error;
        }
    },
    
    // Add combo restriction
    addRestriction: async (comboId, restrictionType, restrictionValue) => {
        try {
            const db = require('./database');
            
            await db.query(
                `INSERT INTO combo_restrictions (combo_id, restriction_type, restriction_value) 
                 VALUES (?, ?, ?)`,
                [comboId, restrictionType, restrictionValue]
            );
            
            return true;
        } catch (error) {
            console.error('Error adding combo restriction:', error);
            throw error;
        }
    },
    
    // Validate if cart items can form a combo
    validateCombo: async (comboId, cartItems) => {
        try {
            const combo = await ComboManager.getById(comboId);
            if (!combo) {
                return { valid: false, message: 'Combo not found' };
            }
            
            const requiredItems = combo.items.filter(item => item.is_required);
            const cartItemMap = {};
            
            // Build map of cart items by menu item ID
            cartItems.forEach(item => {
                if (!cartItemMap[item.id]) {
                    cartItemMap[item.id] = { quantity: 0, item: item };
                }
                cartItemMap[item.id].quantity += item.quantity;
            });
            
            // Check if all required items are in cart with minimum quantities
            for (const requiredItem of requiredItems) {
                const cartItem = cartItemMap[requiredItem.menu_item_id];
                
                if (!cartItem) {
                    return {
                        valid: false,
                        message: `Missing required item: ${requiredItem.item_name}`
                    };
                }
                
                if (cartItem.quantity < requiredItem.min_quantity) {
                    return {
                        valid: false,
                        message: `${requiredItem.item_name} requires at least ${requiredItem.min_quantity} items`
                    };
                }
            }
            
            return { valid: true, combo };
        } catch (error) {
            console.error('Error validating combo:', error);
            return { valid: false, message: 'Validation error' };
        }
    },
    
    // Calculate combo discount
    calculateComboDiscount: (combo, cartItems) => {
        try {
            if (!combo.has_discount) {
                return 0;
            }
            
            const cartItemMap = {};
            cartItems.forEach(item => {
                if (!cartItemMap[item.id]) {
                    cartItemMap[item.id] = { quantity: 0, total: 0 };
                }
                cartItemMap[item.id].quantity += item.quantity;
                cartItemMap[item.id].total += item.total;
            });
            
            // Calculate subtotal of combo items
            let comboSubtotal = 0;
            combo.items.forEach(item => {
                const cartItem = cartItemMap[item.menu_item_id];
                if (cartItem) {
                    comboSubtotal += cartItem.total;
                }
            });
            
            if (combo.discount_type === 'fixed') {
                return Math.min(combo.discount_value, comboSubtotal);
            } else {
                // Percentage discount
                return comboSubtotal * (combo.discount_value / 100);
            }
        } catch (error) {
            console.error('Error calculating combo discount:', error);
            return 0;
        }
    },
    
    // Find applicable combos in cart
    findApplicableCombos: async (cartItems) => {
        try {
            const combos = await ComboManager.getAllActiveCombos();
            const applicableCombos = [];
            
            for (const combo of combos) {
                const validation = await ComboManager.validateCombo(combo.id, cartItems);
                if (validation.valid) {
                    const discount = ComboManager.calculateComboDiscount(combo, cartItems);
                    applicableCombos.push({
                        ...combo,
                        discount,
                        discountAmount: discount
                    });
                }
            }
            
            // Sort by discount amount (highest first)
            return applicableCombos.sort((a, b) => b.discountAmount - a.discountAmount);
        } catch (error) {
            console.error('Error finding applicable combos:', error);
            return [];
        }
    },
    
    // Apply combo to cart items
    applyComboToCart: (cartItems, combo) => {
        try {
            const cartItemMap = {};
            
            // Build map of cart items
            cartItems.forEach(item => {
                if (!cartItemMap[item.id]) {
                    cartItemMap[item.id] = { ...item, quantity: 0, total: 0 };
                }
                cartItemMap[item.id].quantity += item.quantity;
                cartItemMap[item.id].total += item.total;
            });
            
            // Mark combo items and calculate new totals
            const updatedItems = cartItems.map(item => {
                const comboItem = combo.items.find(ci => ci.menu_item_id === item.id);
                
                if (comboItem) {
                    // This is a combo item
                    const discount = ComboManager.calculateComboDiscount(combo, cartItems);
                    const itemSubtotal = item.total;
                    
                    // Apply discount proportionally based on item price
                    const itemDiscount = (item.price / comboSubtotal) * discount;
                    const newTotal = itemSubtotal - itemDiscount;
                    
                    return {
                        ...item,
                        combo_id: combo.id,
                        combo_discount: itemDiscount,
                        total: newTotal
                    };
                }
                
                return item;
            });
            
            return updatedItems;
        } catch (error) {
            console.error('Error applying combo to cart:', error);
            return cartItems;
        }
    },
    
    // Check if combo has restrictions
    hasRestrictions: (combo) => {
        if (!combo.restrictions || combo.restrictions.length === 0) {
            return false;
        }
        
        return combo.restrictions.some(restriction => {
            if (restriction.restriction_type === 'no_other_discounts') {
                return true;
            }
            // Add more restriction checks as needed
            return false;
        });
    }
};

// Export combo manager
module.exports = ComboManager;
