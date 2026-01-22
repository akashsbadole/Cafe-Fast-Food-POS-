// Unit tests for Modifier Manager
// Test modifier pricing calculations and validation logic

const ModifierManager = require('./modifier-manager');

// Mock fetch for testing
global.fetch = jest.fn();

describe('ModifierManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('calculatePriceWithModifiers', () => {
        test('should return base price when no modifiers', () => {
            const basePrice = 5.00;
            const result = ModifierManager.calculatePriceWithModifiers(basePrice);
            expect(result).toBe(5.00);
        });

        test('should add modifier price to base price', () => {
            const basePrice = 5.00;
            const modifiers = [
                { id: 1, price: 0.50, quantity: 1 },
                { id: 2, price: 1.00, quantity: 1 }
            ];
            const result = ModifierManager.calculatePriceWithModifiers(basePrice, modifiers);
            expect(result).toBe(6.50);
        });

        test('should handle multiple quantities of modifiers', () => {
            const basePrice = 5.00;
            const modifiers = [
                { id: 1, price: 0.50, quantity: 2 },
                { id: 2, price: 1.00, quantity: 3 }
            ];
            const result = ModifierManager.calculatePriceWithModifiers(basePrice, modifiers);
            expect(result).toBe(8.00); // 5 + (0.50 * 2) + (1.00 * 3)
        });

        test('should handle zero price modifiers', () => {
            const basePrice = 5.00;
            const modifiers = [
                { id: 1, price: 0, quantity: 1 },
                { id: 2, price: 1.00, quantity: 1 }
            ];
            const result = ModifierManager.calculatePriceWithModifiers(basePrice, modifiers);
            expect(result).toBe(6.00);
        });
    });

    describe('calculateModifierSubtotal', () => {
        test('should return 0 when no modifiers', () => {
            const result = ModifierManager.calculateModifierSubtotal();
            expect(result).toBe(0);
        });

        test('should calculate subtotal of modifiers', () => {
            const modifiers = [
                { id: 1, price: 0.50, quantity: 2 },
                { id: 2, price: 1.00, quantity: 3 }
            ];
            const result = ModifierManager.calculateModifierSubtotal(modifiers);
            expect(result).toBe(3.50); // (0.50 * 2) + (1.00 * 3)
        });

        test('should handle empty array', () => {
            const result = ModifierManager.calculateModifierSubtotal([]);
            expect(result).toBe(0);
        });
    });

    describe('hasRequiredModifiers', () => {
        test('should return true when no required modifiers', () => {
            const itemModifiers = [];
            const selectedModifiers = [];
            const result = ModifierManager.hasRequiredModifiers(itemModifiers, selectedModifiers);
            expect(result).toBe(true);
        });

        test('should return false when required modifier not selected', () => {
            const itemModifiers = [
                { id: 1, name: 'Size', is_required: true }
            ];
            const selectedModifiers = [];
            const result = ModifierManager.hasRequiredModifiers(itemModifiers, selectedModifiers);
            expect(result).toBe(false);
        });

        test('should return true when required modifier is selected', () => {
            const itemModifiers = [
                { id: 1, name: 'Size', is_required: true }
            ];
            const selectedModifiers = [
                { id: 10, group_id: 1, name: 'Large' }
            ];
            const result = ModifierManager.hasRequiredModifiers(itemModifiers, selectedModifiers);
            expect(result).toBe(true);
        });

        test('should handle max_selections constraint', () => {
            const itemModifiers = [
                { id: 1, name: 'Toppings', is_required: true, max_selections: 2 }
            ];
            const selectedModifiers = [
                { id: 10, group_id: 1, name: 'Chocolate' },
                { id: 11, group_id: 1, name: 'Sprinkles' },
                { id: 12, group_id: 1, name: 'Nuts' }
            ];
            const result = ModifierManager.hasRequiredModifiers(itemModifiers, selectedModifiers);
            expect(result).toBe(false); // Exceeds max_selections
        });

        test('should return true when max_selections is met', () => {
            const itemModifiers = [
                { id: 1, name: 'Toppings', is_required: true, max_selections: 2 }
            ];
            const selectedModifiers = [
                { id: 10, group_id: 1, name: 'Chocolate' },
                { id: 11, group_id: 1, name: 'Sprinkles' }
            ];
            const result = ModifierManager.hasRequiredModifiers(itemModifiers, selectedModifiers);
            expect(result).toBe(true);
        });
    });

    describe('validateModifiers', () => {
        test('should return valid when no required modifiers', () => {
            const itemModifiers = [];
            const selectedModifiers = [];
            const result = ModifierManager.validateModifiers(itemModifiers, selectedModifiers);
            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        test('should return error when required modifier not selected', () => {
            const itemModifiers = [
                { id: 1, name: 'Size', is_required: true }
            ];
            const selectedModifiers = [];
            const result = ModifierManager.validateModifiers(itemModifiers, selectedModifiers);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Please select at least one Size');
        });

        test('should return error when max_selections exceeded', () => {
            const itemModifiers = [
                { id: 1, name: 'Topping', is_required: true, max_selections: 2 }
            ];
            const selectedModifiers = [
                { id: 10, group_id: 1, name: 'Chocolate' },
                { id: 11, group_id: 1, name: 'Sprinkles' },
                { id: 12, group_id: 1, name: 'Nuts' }
            ];
            const result = ModifierManager.validateModifiers(itemModifiers, selectedModifiers);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('You can select at most 2 Topping(s)');
        });

        test('should return multiple errors for multiple violations', () => {
            const itemModifiers = [
                { id: 1, name: 'Size', is_required: true },
                { id: 2, name: 'Milk', is_required: true }
            ];
            const selectedModifiers = [];
            const result = ModifierManager.validateModifiers(itemModifiers, selectedModifiers);
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBe(2);
            expect(result.errors).toContain('Please select at least one Size');
            expect(result.errors).toContain('Please select at least one Milk');
        });
    });

    describe('API methods', () => {
        test('getAllModifierGroups should call fetch with correct URL', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [{ id: 1, name: 'Size' }]
            });

            const result = await ModifierManager.getAllModifierGroups();
            expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/modifier-groups');
            expect(result).toEqual([{ id: 1, name: 'Size' }]);
        });

        test('getAllModifiers should call fetch with correct URL', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [{ id: 1, name: 'Large' }]
            });

            const result = await ModifierManager.getAllModifiers();
            expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/modifiers');
            expect(result).toEqual([{ id: 1, name: 'Large' }]);
        });

        test('getModifierGroupsForItem should call fetch with correct URL', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [{ id: 1, name: 'Size' }]
            });

            const result = await ModifierManager.getModifierGroupsForItem(123);
            expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/menu-items/123/modifiers');
            expect(result).toEqual([{ id: 1, name: 'Size' }]);
        });

        test('addModifierToCartItem should call fetch with POST', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            const result = await ModifierManager.addModifierToCartItem(1, 10, 2);
            expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/cart/add-modifier', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItemId: 1,
                    modifierId: 10,
                    quantity: 2
                })
            });
            expect(result).toEqual({ success: true });
        });

        test('updateModifierOnCartItem should call fetch with PUT', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            const result = await ModifierManager.updateModifierOnCartItem(1, 10, 3);
            expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/cart/update-modifier', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItemId: 1,
                    modifierId: 10,
                    quantity: 3
                })
            });
            expect(result).toEqual({ success: true });
        });

        test('removeModifierFromCartItem should call fetch with DELETE', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            const result = await ModifierManager.removeModifierFromCartItem(1, 10);
            expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/cart/remove-modifier', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItemId: 1,
                    modifierId: 10
                })
            });
            expect(result).toEqual({ success: true });
        });

        test('should handle API errors gracefully', async () => {
            fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Not found' })
            });

            await expect(ModifierManager.getAllModifierGroups())
                .rejects
                .toThrow('Failed to add modifier');
        });
    });
});