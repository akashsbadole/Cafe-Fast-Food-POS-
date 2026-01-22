// Recipe API Integration Tests
// Tests for recipe/bill of materials API endpoints

const assert = require('assert');
const request = require('supertest');
const express = require('express');
const router = require('./enterprise-endpoints');
const jwt = require('jsonwebtoken');

// Mock database
const mockDb = {
    prepare: (query) => {
        return {
            run: () => ({ lastInsertRowid: 1 }),
            get: () => ({ id: 1, name: 'Test Recipe' }),
            all: () => [{ id: 1, name: 'Test Recipe' }]
        };
    }
};

// Mock logger
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {}
};

// Mock RecipeManager
class MockRecipeManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
    }
    
    async init() {}
    
    async getAllRecipes(activeOnly = true, menuItemId = null) {
        return [
            { id: 1, name: 'Test Recipe 1', menu_item_id: 1, is_active: 1 },
            { id: 2, name: 'Test Recipe 2', menu_item_id: 2, is_active: 1 }
        ];
    }
    
    async getRecipeById(id) {
        return { id, name: `Recipe ${id}`, menu_item_id: id, is_active: 1 };
    }
    
    async createRecipe(recipeData) {
        return {
            id: 1,
            name: recipeData.name,
            menu_item_id: recipeData.menu_item_id,
            description: recipeData.description || '',
            is_active: recipeData.is_active || 1,
            created_at: new Date()
        };
    }
    
    async updateRecipe(id, updates) {
        return {
            id,
            ...updates,
            updated_at: new Date()
        };
    }
    
    async deleteRecipe(id) {
        return { success: true, id };
    }
    
    async getRecipeIngredients(recipeId) {
        return [
            { id: 1, recipe_id: recipeId, menu_item_id: 1, quantity: 100, unit: 'gram' },
            { id: 2, recipe_id: recipeId, menu_item_id: 2, quantity: 50, unit: 'ml' }
        ];
    }
    
    async addIngredientToRecipe(recipeId, menuItemId, quantity, unit, isWeighted = false, displayOrder = 0, notes = '') {
        return {
            id: 1,
            recipe_id: recipeId,
            menu_item_id: menuItemId,
            quantity,
            unit,
            is_weighted: isWeighted ? 1 : 0,
            display_order: displayOrder,
            notes
        };
    }
    
    async updateRecipeIngredient(id, updates) {
        return { id, ...updates };
    }
    
    async removeIngredientFromRecipe(id) {
        return { success: true, id };
    }
    
    async calculateRecipeCost(recipeId) {
        return 5.99;
    }
    
    async checkRecipeIngredientAvailability(recipeId, quantity = 1) {
        return {
            is_available: true,
            recipe_id: recipeId,
            quantity_requested: quantity,
            insufficient_ingredients: []
        };
    }
    
    async getRecipeUsageHistory(recipeId, limit = 50) {
        return [
            { id: 1, recipe_id: recipeId, order_id: 1, quantity_used: 1, created_at: '2024-01-01' },
            { id: 2, recipe_id: recipeId, order_id: 2, quantity_used: 2, created_at: '2024-01-02' }
        ];
    }
    
    async setConversionRate(ingredientId, fromUnit, toUnit, conversionFactor, isActive = true) {
        return {
            id: 1,
            ingredient_id: ingredientId,
            from_unit: fromUnit,
            to_unit: toUnit,
            conversion_factor: conversionFactor,
            is_active: isActive ? 1 : 0
        };
    }
    
    async getConversionRatesForIngredient(ingredientId) {
        return [
            { id: 1, ingredient_id: ingredientId, from_unit: 'gram', to_unit: 'kilogram', conversion_factor: 1000 }
        ];
    }
    
    async resolveIngredientAlert(alertId, resolvedBy, notes = '') {
        return {
            id: alertId,
            is_resolved: 1,
            resolved_by: resolvedBy,
            resolved_at: new Date(),
            notes
        };
    }
}

// Mock ReportingManager
class MockReportingManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
    }
    
    async init() {}
    
    async logAudit(userId, action, tableName, recordId, oldValues, newValues, ipAddress, userAgent) {}
    
    async getRecipeCostReport() {
        return [
            { id: 1, recipe_name: 'Recipe 1', menu_item_name: 'Item 1', recipe_cost: 5.99, usage_count: 10 },
            { id: 2, recipe_name: 'Recipe 2', menu_item_name: 'Item 2', recipe_cost: 7.99, usage_count: 5 }
        ];
    }
    
    async getIngredientUsageReport(recipeId = null) {
        return [
            { ingredient_id: 1, ingredient_name: 'Coffee Beans', total_quantity_used: 1000, total_cost: 50.00 },
            { ingredient_id: 2, ingredient_name: 'Milk', total_quantity_used: 2000, total_cost: 20.00 }
        ];
    }
    
    async getRecipeEfficiencyReport() {
        return [
            { id: 1, recipe_name: 'Recipe 1', selling_price: 10.00, recipe_cost: 5.99, profit_per_item: 4.01, items_sold: 10, total_profit: 40.10, cost_percentage: 59.9 },
            { id: 2, recipe_name: 'Recipe 2', selling_price: 15.00, recipe_cost: 7.99, profit_per_item: 7.01, items_sold: 5, total_profit: 35.05, cost_percentage: 53.27 }
        ];
    }
    
    async getRecipeIngredientAlerts(resolvedFilter = null) {
        return [
            { id: 1, recipe_id: 1, ingredient_id: 1, is_resolved: 0, created_at: '2024-01-01' },
            { id: 2, recipe_id: 2, ingredient_id: 2, is_resolved: 1, created_at: '2024-01-02' }
        ];
    }
    
    async exportToCSV(data, filename) {
        return `exports/${filename}`;
    }
    
    async exportToPDF(data, filename, options = {}) {
        return `exports/${filename}`;
    }
}

describe('Recipe API Endpoints', () => {
    let app;
    let token;
    
    before(() => {
        // Create Express app
        app = express();
        app.use(express.json());
        app.use(router);
        
        // Create test token
        token = jwt.sign(
            { id: 1, username: 'testuser', permissions: ['manage_menu', 'view_reports'] },
            'test-secret',
            { expiresIn: '1h' }
        );
    });
    
    describe('GET /api/recipes', () => {
        it('should return all recipes', (done) => {
            request(app)
                .get('/api/recipes')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
        
        it('should filter by active status', (done) => {
            request(app)
                .get('/api/recipes?activeOnly=true')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    done();
                });
        });
    });
    
    describe('GET /api/recipes/:id', () => {
        it('should return a specific recipe', (done) => {
            request(app)
                .get('/api/recipes/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.id, 1);
                    assert.strictEqual(res.body.name, 'Recipe 1');
                    done();
                });
        });
        
        it('should return 404 for non-existent recipe', (done) => {
            request(app)
                .get('/api/recipes/999')
                .set('Authorization', `Bearer ${token}`)
                .expect(404)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Recipe not found');
                    done();
                });
        });
    });
    
    describe('POST /api/recipes', () => {
        it('should create a new recipe', (done) => {
            request(app)
                .post('/api/recipes')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'New Recipe',
                    menu_item_id: 1,
                    description: 'Test description',
                    is_active: true
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'New Recipe');
                    assert.strictEqual(res.body.menu_item_id, 1);
                    done();
                });
        });
        
        it('should return 400 for missing required fields', (done) => {
            request(app)
                .post('/api/recipes')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Incomplete Recipe' })
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Name and menu item ID are required');
                    done();
                });
        });
    });
    
    describe('PUT /api/recipes/:id', () => {
        it('should update a recipe', (done) => {
            request(app)
                .put('/api/recipes/1')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Updated Recipe',
                    description: 'Updated description'
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Updated Recipe');
                    done();
                });
        });
        
        it('should return 404 for non-existent recipe', (done) => {
            request(app)
                .put('/api/recipes/999')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Update Non-existent' })
                .expect(404)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Recipe not found');
                    done();
                });
        });
    });
    
    describe('DELETE /api/recipes/:id', () => {
        it('should delete a recipe', (done) => {
            request(app)
                .delete('/api/recipes/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.message, 'Recipe deleted successfully');
                    done();
                });
        });
        
        it('should return 404 for non-existent recipe', (done) => {
            request(app)
                .delete('/api/recipes/999')
                .set('Authorization', `Bearer ${token}`)
                .expect(404)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Recipe not found');
                    done();
                });
        });
    });
    
    describe('GET /api/recipes/:id/ingredients', () => {
        it('should return recipe ingredients', (done) => {
            request(app)
                .get('/api/recipes/1/ingredients')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
    });
    
    describe('POST /api/recipes/:id/ingredients', () => {
        it('should add an ingredient to a recipe', (done) => {
            request(app)
                .post('/api/recipes/1/ingredients')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    menu_item_id: 3,
                    quantity: 200,
                    unit: 'gram',
                    is_weighted: false,
                    display_order: 1,
                    notes: 'Test ingredient'
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.menu_item_id, 3);
                    assert.strictEqual(res.body.quantity, 200);
                    done();
                });
        });
        
        it('should return 400 for missing required fields', (done) => {
            request(app)
                .post('/api/recipes/1/ingredients')
                .set('Authorization', `Bearer ${token}`)
                .send({ menu_item_id: 3 })
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Menu item ID and quantity are required');
                    done();
                });
        });
    });
    
    describe('PUT /api/recipe-ingredients/:id', () => {
        it('should update a recipe ingredient', (done) => {
            request(app)
                .put('/api/recipe-ingredients/1')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    quantity: 150,
                    unit: 'ml'
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.quantity, 150);
                    done();
                });
        });
    });
    
    describe('DELETE /api/recipe-ingredients/:id', () => {
        it('should remove an ingredient from a recipe', (done) => {
            request(app)
                .delete('/api/recipe-ingredients/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.message, 'Ingredient removed from recipe successfully');
                    done();
                });
        });
    });
    
    describe('POST /api/recipes/ingredients/:ingredientId/conversion-rates', () => {
        it('should set conversion rate', (done) => {
            request(app)
                .post('/api/recipes/ingredients/1/conversion-rates')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    from_unit: 'gram',
                    to_unit: 'kilogram',
                    conversion_factor: 1000,
                    is_active: true
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.conversion_factor, 1000);
                    done();
                });
        });
    });
    
    describe('GET /api/recipes/:id/calculate-cost', () => {
        it('should calculate recipe cost', (done) => {
            request(app)
                .get('/api/recipes/1/calculate-cost')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.recipe_cost, 5.99);
                    done();
                });
        });
    });
    
    describe('GET /api/recipes/:id/check-availability', () => {
        it('should check recipe ingredient availability', (done) => {
            request(app)
                .get('/api/recipes/1/check-availability?quantity=1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.is_available, true);
                    done();
                });
        });
    });
    
    describe('GET /api/recipes/:id/usage-history', () => {
        it('should get recipe usage history', (done) => {
            request(app)
                .get('/api/recipes/1/usage-history')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
    });
    
    describe('GET /api/reports/recipes/cost', () => {
        it('should return recipe cost report', (done) => {
            request(app)
                .get('/api/reports/recipes/cost')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
    });
    
    describe('GET /api/reports/recipes/ingredients', () => {
        it('should return ingredient usage report', (done) => {
            request(app)
                .get('/api/reports/recipes/ingredients')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
        
        it('should filter by recipe ID', (done) => {
            request(app)
                .get('/api/reports/recipes/ingredients?recipeId=1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    done();
                });
        });
    });
    
    describe('GET /api/reports/recipes/efficiency', () => {
        it('should return recipe efficiency report', (done) => {
            request(app)
                .get('/api/reports/recipes/efficiency')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
    });
    
    describe('GET /api/reports/recipes/alerts', () => {
        it('should return recipe ingredient alerts', (done) => {
            request(app)
                .get('/api/reports/recipes/alerts')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
        
        it('should filter by resolved status', (done) => {
            request(app)
                .get('/api/reports/recipes/alerts?resolved=true')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    done();
                });
        });
    });
    
    describe('POST /api/recipes/alerts/:id/resolve', () => {
        it('should resolve a recipe ingredient alert', (done) => {
            request(app)
                .post('/api/recipes/alerts/1/resolve')
                .set('Authorization', `Bearer ${token}`)
                .send({ notes: 'Alert resolved' })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.is_resolved, 1);
                    done();
                });
        });
    });
    
    describe('GET /api/reports/recipes/export/csv', () => {
        it('should export recipe cost report to CSV', (done) => {
            request(app)
                .get('/api/reports/recipes/export/csv?type=cost')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    done();
                });
        });
        
        it('should return 400 for invalid report type', (done) => {
            request(app)
                .get('/api/reports/recipes/export/csv?type=invalid')
                .set('Authorization', `Bearer ${token}`)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Invalid report type');
                    done();
                });
        });
    });
    
    describe('GET /api/reports/recipes/export/pdf', () => {
        it('should export recipe cost report to PDF', (done) => {
            request(app)
                .get('/api/reports/recipes/export/pdf?type=cost')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    done();
                });
        });
    });
    
    describe('Authentication and Authorization', () => {
        it('should return 401 for missing token', (done) => {
            request(app)
                .get('/api/recipes')
                .expect(401)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Unauthorized - No token provided');
                    done();
                });
        });
        
        it('should return 401 for invalid token', (done) => {
            request(app)
                .get('/api/recipes')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Unauthorized - Invalid token');
                    done();
                });
        });
        
        it('should return 403 for insufficient permissions', (done) => {
            const limitedToken = jwt.sign(
                { id: 1, username: 'limiteduser', permissions: [] },
                'test-secret',
                { expiresIn: '1h' }
            );
            
            request(app)
                .get('/api/recipes')
                .set('Authorization', `Bearer ${limitedToken}`)
                .expect(403)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Forbidden - Insufficient permissions');
                    done();
                });
        });
    });
});

console.log('All integration tests completed!');