// Modifier Manager for Cafe POS
// Handles modifier groups, modifiers, and their pricing calculations

const ModifierManager = {
    // Get all modifier groups
    getAllModifierGroups: async () => {
        try {
            const response = await fetch('http://localhost:3000/api/modifier-groups');
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching modifier groups:', error);
            return [];
        }
    },
    
    // Get all modifiers
    getAllModifiers: async () => {
        try {
            const response = await fetch('http://localhost:3000/api/modifiers');
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching modifiers:', error);
            return [];
        }
    },
    
    // Get modifier groups for a specific menu item
    getModifierGroupsForItem: async (menuItemId) => {
        try {
            const response = await fetch(`http://localhost:3000/api/menu-items/${menuItemId}/modifiers`);
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching modifier groups for item:', error);
            return [];
        }
    },
    
    // Calculate total price with modifiers
    calculatePriceWithModifiers: (basePrice, modifiers = []) => {
        return modifiers.reduce((total, modifier) => {
            return total + (modifier.price * (modifier.quantity || 1));
        }, basePrice);
    },
    
    // Calculate modifier subtotal
    calculateModifierSubtotal: (modifiers = []) => {
        return modifiers.reduce((total, modifier) => {
            return total + (modifier.price * (modifier.quantity || 1));
        }, 0);
    },
    
    // Add modifier to cart item
    addModifierToCartItem: async (cartItemId, modifierId, quantity = 1) => {
        try {
            const response = await fetch('http://localhost:3000/api/cart/add-modifier', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItemId,
                    modifierId,
                    quantity
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            throw new Error('Failed to add modifier');
        } catch (error) {
            console.error('Error adding modifier to cart item:', error);
            throw error;
        }
    },
    
    // Update modifier on cart item
    updateModifierOnCartItem: async (cartItemId, modifierId, quantity) => {
        try {
            const response = await fetch('http://localhost:3000/api/cart/update-modifier', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItemId,
                    modifierId,
                    quantity
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            throw new Error('Failed to update modifier');
        } catch (error) {
            console.error('Error updating modifier on cart item:', error);
            throw error;
        }
    },
    
    // Remove modifier from cart item
    removeModifierFromCartItem: async (cartItemId, modifierId) => {
        try {
            const response = await fetch('http://localhost:3000/api/cart/remove-modifier', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cartItemId,
                    modifierId
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            throw new Error('Failed to remove modifier');
        } catch (error) {
            console.error('Error removing modifier from cart item:', error);
            throw error;
        }
    },
    
    // Check if item has required modifiers
    hasRequiredModifiers: (itemModifiers, selectedModifiers) => {
        const requiredGroups = itemModifiers.filter(group => group.is_required);
        
        return requiredGroups.every(requiredGroup => {
            const selectedInGroup = selectedModifiers.filter(mod => 
                mod.group_id === requiredGroup.id
            );
            
            // Check if max_selections is specified and met
            if (requiredGroup.max_selections && selectedInGroup.length > 0) {
                return selectedInGroup.length <= requiredGroup.max_selections;
            }
            
            // For required groups, at least one selection is needed
            return requiredGroup.max_selections === 0 || selectedInGroup.length > 0;
        });
    },
    
    // Validate modifier selection
    validateModifiers: (itemModifiers, selectedModifiers) => {
        const errors = [];
        
        // Check required modifiers
        const requiredGroups = itemModifiers.filter(group => group.is_required);
        requiredGroups.forEach(group => {
            const selectedInGroup = selectedModifiers.filter(mod => mod.group_id === group.id);
            
            if (selectedInGroup.length === 0) {
                errors.push(`Please select at least one ${group.name}`);
            } else if (group.max_selections && selectedInGroup.length > group.max_selections) {
                errors.push(`You can select at most ${group.max_selections} ${group.name}(s)`);
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
};

// Export modifier manager
if (typeof window !== 'undefined') {
  window.ModifierManager = ModifierManager;
}

module.exports = ModifierManager;