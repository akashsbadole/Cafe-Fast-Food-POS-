// Recipe Manager Unit Tests
// Tests for recipe/bill of materials tracking functionality

const assert = require('assert');
const sinon = require('sinon');
const RecipeManager = require('./recipe-manager');

// Mock database
const mockDb = {
    query: sinon.stub(),
    prepare: (query) => {
        return {
            run: sinon.stub(),
            get: sinon.stub(),
            all: sinon.stub()
        };
    },
    exec: sinon.stub()
};

// Mock logger
const mockLogger = {
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub()
};

describe('RecipeManager', () => {
    let recipeManager;
    let dbStub;
    
    beforeEach(() => {
        recipeManager = new RecipeManager(mockDb, mockLogger);
        dbStub = {
            prepare: (query) => {
                return {
                    run: sinon.stub(),
                    get: sinon.stub(),
                    all: sinon.stub()
                };
            }
        };
    });
    
    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            const manager = new RecipeManager(mockDb, mockLogger);
            assert.strictEqual(manager.db, mockDb);
            assert.strictEqual(manager.logger, mockLogger);
        });
    });
    
    describe('Recipe CRUD Operations', () => {
        it('should create a recipe', async () => {
            const queryStub = sinon.stub();
            queryStub.onCall(0).returns({ rows: [{ id: 1 }] }); // INSERT RETURNING
            queryStub.onCall(1).returns({}); // UPDATE
            queryStub.onCall(2).returns({ rows: [{ id: 1, name: 'Test Recipe', menu_item_id: 1, is_active: 1 }] }); // SELECT

            const manager = new RecipeManager({ query: queryStub }, mockLogger);

            const recipe = await manager.createRecipe({
                name: 'Test Recipe',
                menu_item_id: 1,
                description: 'Test description',
                is_active: true
            });

            assert.strictEqual(recipe.id, 1);
            assert.strictEqual(recipe.name, 'Test Recipe');
        });
        
        it('should get a recipe by ID', async () => {
            const mockRecipe = {
                id: 1,
                name: 'Test Recipe',
                menu_item_id: 1,
                is_active: 1
            };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockRecipe),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const recipe = await manager.getRecipeById(1);
            
            assert.deepStrictEqual(recipe, mockRecipe);
        });
        
        it('should update a recipe', async () => {
            const mockRecipe = {
                id: 1,
                name: 'Updated Recipe',
                menu_item_id: 1,
                is_active: 1
            };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockRecipe),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const recipe = await manager.updateRecipe(1, {
                name: 'Updated Recipe'
            });
            
            assert.strictEqual(recipe.name, 'Updated Recipe');
        });
        
        it('should delete a recipe', async () => {
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub(),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            await manager.deleteRecipe(1);
            
            assert(prepareStub.called);
        });
    });
    
    describe('Recipe Ingredients', () => {
        it('should add an ingredient to a recipe', async () => {
            const mockIngredient = {
                id: 1,
                recipe_id: 1,
                menu_item_id: 2,
                quantity: 100,
                unit: 'gram'
            };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub().returns({ lastInsertRowid: 1 }),
                get: sinon.stub().returns(mockIngredient),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const ingredient = await manager.addIngredientToRecipe(1, 2, 100, 'gram');
            
            assert.strictEqual(ingredient.recipe_id, 1);
            assert.strictEqual(ingredient.menu_item_id, 2);
        });
        
        it('should get recipe ingredients', async () => {
            const mockIngredients = [
                { id: 1, recipe_id: 1, menu_item_id: 2, quantity: 100, unit: 'gram' }
            ];
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub(),
                all: sinon.stub().returns(mockIngredients)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const ingredients = await manager.getRecipeIngredients(1);
            
            assert.deepStrictEqual(ingredients, mockIngredients);
        });
        
        it('should update a recipe ingredient', async () => {
            const mockIngredient = {
                id: 1,
                recipe_id: 1,
                menu_item_id: 2,
                quantity: 150,
                unit: 'gram'
            };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockIngredient),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const ingredient = await manager.updateRecipeIngredient(1, { quantity: 150 });
            
            assert.strictEqual(ingredient.quantity, 150);
        });
        
        it('should remove an ingredient from a recipe', async () => {
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub(),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            await manager.removeIngredientFromRecipe(1);
            
            assert(prepareStub.called);
        });
    });
    
    describe('Recipe Cost Calculation', () => {
        it('should calculate recipe cost', async () => {
            const mockIngredients = [
                { menu_item_id: 1, quantity: 100, unit: 'gram', price: 0.50 }
            ];
            const mockMenuItem = { price: 10.00 };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockMenuItem),
                all: sinon.stub().returns(mockIngredients)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const cost = await manager.calculateRecipeCost(1);
            
            assert.strictEqual(cost, 50); // 100g * 0.50 = 50
        });
    });
    
    describe('Inventory Deduction', () => {
        it('should deduct ingredients from inventory', async () => {
            const mockIngredients = [
                { id: 1, menu_item_id: 1, quantity: 100, unit: 'gram' }
            ];
            const mockInventory = { id: 1, menu_item_id: 1, stock_quantity: 1000 };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockInventory),
                all: sinon.stub().returns(mockIngredients)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            await manager.deductIngredientsFromInventory(1, 1);
            
            assert(prepareStub.called);
        });
    });
    
    describe('Recipe Availability Checking', () => {
        it('should check recipe ingredient availability', async () => {
            const mockIngredients = [
                { menu_item_id: 1, quantity: 100, unit: 'gram' }
            ];
            const mockInventory = { stock_quantity: 500 };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockInventory),
                all: sinon.stub().returns(mockIngredients)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const availability = await manager.checkRecipeIngredientAvailability(1, 1);
            
            assert.strictEqual(availability.is_available, true);
        });
        
        it('should return false when ingredients are insufficient', async () => {
            const mockIngredients = [
                { menu_item_id: 1, quantity: 1000, unit: 'gram' }
            ];
            const mockInventory = { stock_quantity: 500 };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockInventory),
                all: sinon.stub().returns(mockIngredients)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const availability = await manager.checkRecipeIngredientAvailability(1, 1);
            
            assert.strictEqual(availability.is_available, false);
        });
    });
    
    describe('Recipe Usage History', () => {
        it('should record recipe usage', async () => {
            const prepareStub = sinon.stub().returns({
                run: sinon.stub().returns({ lastInsertRowid: 1 }),
                get: sinon.stub(),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            await manager.recordRecipeUsage(1, 1, 100);
            
            assert(prepareStub.called);
        });
        
        it('should get recipe usage history', async () => {
            const mockHistory = [
                { id: 1, recipe_id: 1, order_id: 1, quantity_used: 1, created_at: '2024-01-01' }
            ];
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub(),
                all: sinon.stub().returns(mockHistory)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const history = await manager.getRecipeUsageHistory(1, 10);
            
            assert.deepStrictEqual(history, mockHistory);
        });
    });
    
    describe('Ingredient Conversion Rates', () => {
        it('should set conversion rate', async () => {
            const mockRate = {
                id: 1,
                ingredient_id: 1,
                from_unit: 'gram',
                to_unit: 'kilogram',
                conversion_factor: 1000
            };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub().returns({ lastInsertRowid: 1 }),
                get: sinon.stub().returns(mockRate),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const rate = await manager.setConversionRate(1, 'gram', 'kilogram', 1000);
            
            assert.strictEqual(rate.conversion_factor, 1000);
        });
        
        it('should get conversion rates for ingredient', async () => {
            const mockRates = [
                { id: 1, ingredient_id: 1, from_unit: 'gram', to_unit: 'kilogram', conversion_factor: 1000 }
            ];
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub(),
                all: sinon.stub().returns(mockRates)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const rates = await manager.getConversionRatesForIngredient(1);
            
            assert.deepStrictEqual(rates, mockRates);
        });
    });
    
    describe('Recipe Ingredient Alerts', () => {
        it('should check for low stock alerts', async () => {
            const mockRecipes = [
                { id: 1, name: 'Test Recipe', menu_item_id: 1 }
            ];
            const mockIngredients = [
                { menu_item_id: 1, quantity: 100, unit: 'gram' }
            ];
            const mockInventory = { stock_quantity: 50 };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockInventory),
                all: sinon.stub().returns([mockRecipes, mockIngredients])
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            await manager.checkForLowStockAlerts();
            
            assert(prepareStub.called);
        });
        
        it('should get recipe ingredient alerts', async () => {
            const mockAlerts = [
                { id: 1, recipe_id: 1, ingredient_id: 1, is_resolved: 0 }
            ];
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub(),
                all: sinon.stub().returns(mockAlerts)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const alerts = await manager.getRecipeIngredientAlerts();
            
            assert.deepStrictEqual(alerts, mockAlerts);
        });
        
        it('should resolve ingredient alert', async () => {
            const mockAlert = {
                id: 1,
                recipe_id: 1,
                ingredient_id: 1,
                is_resolved: 1,
                resolved_by: 1,
                resolved_at: '2024-01-01'
            };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockAlert),
                all: sinon.stub()
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            const alert = await manager.resolveIngredientAlert(1, 1, 'Resolved');
            
            assert.strictEqual(alert.is_resolved, 1);
        });
    });
    
    describe('Weighted Ingredients', () => {
        it('should handle weighted ingredients in recipes', async () => {
            const mockIngredients = [
                { menu_item_id: 1, quantity: 100, unit: 'gram', is_weighted: 1 }
            ];
            const mockInventory = { stock_quantity: 1000, weight_unit: 'gram', current_weight: 1000 };
            
            const prepareStub = sinon.stub().returns({
                run: sinon.stub(),
                get: sinon.stub().returns(mockInventory),
                all: sinon.stub().returns(mockIngredients)
            });
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            await manager.deductIngredientsFromInventory(1, 1);
            
            assert(prepareStub.called);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            const prepareStub = sinon.stub().throws(new Error('Database error'));
            
            const manager = new RecipeManager({ prepare: prepareStub }, mockLogger);
            
            try {
                await manager.getRecipeById(1);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Database error');
            }
        });
    });
});

console.log('All tests completed!');