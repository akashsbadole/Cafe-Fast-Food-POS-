# Product Modifiers

## Overview

The Product Modifiers feature allows customers to customize menu items with additional options (e.g., extra cheese, different sauce, size variations) that can affect pricing.

## Database Schema

### Tables

#### `modifier_groups`
- `id`: Primary key
- `name`: Group name (e.g., "Sauces", "Toppings")
- `description`: Optional description
- `is_required`: Boolean (required or optional)
- `max_selections`: Maximum number of selections (0 for unlimited)
- `display_order`: Order for UI display
- `is_active`: Active/inactive status
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

#### `modifiers`
- `id`: Primary key
- `group_id`: Foreign key to modifier_groups
- `name`: Modifier name (e.g., "Extra Cheese")
- `price`: Additional price for this modifier
- `display_order`: Order within group
- `is_active`: Active/inactive status
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

#### `menu_item_modifier_groups`
- `id`: Primary key
- `menu_item_id`: Foreign key to menu_items
- `modifier_group_id`: Foreign key to modifier_groups
- `created_at`: Creation timestamp

#### `order_item_modifiers`
- `id`: Primary key
- `order_item_id`: Foreign key to order_items
- `modifier_id`: Foreign key to modifiers
- `quantity`: Quantity of this modifier
- `price`: Price at time of order
- `created_at`: Creation timestamp

## API Endpoints

### Modifier Groups

#### `GET /api/modifier-groups`
**List all modifier groups**

**Response:**
```json
[
  {
    "id": 1,
    "name": "Sauces",
    "description": "Choose your sauce",
    "is_required": false,
    "max_selections": 1,
    "display_order": 1,
    "is_active": true,
    "created_at": "2026-01-20T10:00:00Z",
    "updated_at": "2026-01-20T10:00:00Z"
  }
]
```

#### `POST /api/modifier-groups`
**Create new modifier group**

**Request:**
```json
{
  "name": "Sauces",
  "description": "Choose your sauce",
  "is_required": false,
  "max_selections": 1,
  "display_order": 1
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Sauces",
  "description": "Choose your sauce",
  "is_required": false,
  "max_selections": 1,
  "display_order": 1,
  "is_active": true,
  "created_at": "2026-01-20T10:00:00Z",
  "updated_at": "2026-01-20T10:00:00Z"
}
```

#### `GET /api/modifier-groups/:id`
**Get specific modifier group**

**Response:**
```json
{
  "id": 1,
  "name": "Sauces",
  "description": "Choose your sauce",
  "is_required": false,
  "max_selections": 1,
  "display_order": 1,
  "is_active": true,
  "created_at": "2026-01-20T10:00:00Z",
  "updated_at": "2026-01-20T10:00:00Z"
}
```

#### `PUT /api/modifier-groups/:id`
**Update modifier group**

**Request:**
```json
{
  "name": "Sauces",
  "description": "Choose your sauce",
  "is_required": false,
  "max_selections": 1,
  "display_order": 1,
  "is_active": true
}
```

#### `DELETE /api/modifier-groups/:id`
**Delete modifier group**

**Response:** `204 No Content`

### Modifiers

#### `GET /api/modifiers`
**List all modifiers**

**Response:**
```json
[
  {
    "id": 1,
    "group_id": 1,
    "name": "Extra Cheese",
    "price": 0.50,
    "display_order": 1,
    "is_active": true,
    "created_at": "2026-01-20T10:00:00Z",
    "updated_at": "2026-01-20T10:00:00Z"
  }
]
```

#### `POST /api/modifiers`
**Create new modifier**

**Request:**
```json
{
  "group_id": 1,
  "name": "Extra Cheese",
  "price": 0.50,
  "display_order": 1
}
```

#### `GET /api/modifiers/:id`
**Get specific modifier**

**Response:**
```json
{
  "id": 1,
  "group_id": 1,
  "name": "Extra Cheese",
  "price": 0.50,
  "display_order": 1,
  "is_active": true,
  "created_at": "2026-01-20T10:00:00Z",
  "updated_at": "2026-01-20T10:00:00Z"
}
```

#### `PUT /api/modifiers/:id`
**Update modifier**

**Request:**
```json
{
  "group_id": 1,
  "name": "Extra Cheese",
  "price": 0.50,
  "display_order": 1,
  "is_active": true
}
```

#### `DELETE /api/modifiers/:id`
**Delete modifier**

**Response:** `204 No Content`

### Menu Item Modifiers

#### `GET /api/menu-items/:id/modifiers`
**Get modifiers for a menu item**

**Response:**
```json
[
  {
    "id": 1,
    "name": "Sauces",
    "description": "Choose your sauce",
    "is_required": false,
    "max_selections": 1,
    "modifiers": [
      {
        "id": 1,
        "name": "Ketchup",
        "price": 0.00
      },
      {
        "id": 2,
        "name": "Mayo",
        "price": 0.00
      }
    ]
  }
]
```

#### `POST /api/menu-items/:id/modifiers`
**Add modifier group to menu item**

**Request:**
```json
{
  "modifier_group_id": 1
}
```

#### `DELETE /api/menu-items/:id/modifiers/:groupId`
**Remove modifier group from menu item**

**Response:** `204 No Content`

### Cart Modifiers

#### `POST /api/cart/add-modifier`
**Add modifier to cart item**

**Request:**
```json
{
  "cartItemId": 123,
  "modifierId": 1,
  "quantity": 1
}
```

**Response:**
```json
{
  "success": true,
  "cartItem": {
    "id": 123,
    "menu_item_id": 456,
    "quantity": 1,
    "price": 5.99,
    "modifiers": [
      {
        "id": 1,
        "name": "Extra Cheese",
        "price": 0.50,
        "quantity": 1
      }
    ],
    "total": 6.49
  }
}
```

#### `PUT /api/cart/update-modifier`
**Update modifier on cart item**

**Request:**
```json
{
  "cartItemId": 123,
  "modifierId": 1,
  "quantity": 2
}
```

#### `DELETE /api/cart/remove-modifier`
**Remove modifier from cart item**

**Request:**
```json
{
  "cartItemId": 123,
  "modifierId": 1
}
```

## Business Logic

### ModifierManager

**Methods:**

- `getAllModifierGroups()` - Fetch all modifier groups
- `getAllModifiers()` - Fetch all modifiers
- `getModifierGroupsForItem(menuItemId)` - Get modifiers for specific item
- `calculatePriceWithModifiers(basePrice, modifiers)` - Calculate total price with modifiers
- `calculateModifierSubtotal(modifiers)` - Calculate subtotal for modifiers only
- `addModifierToCartItem(cartItemId, modifierId, quantity)` - Add modifier to cart
- `updateModifierOnCartItem(cartItemId, modifierId, quantity)` - Update modifier quantity
- `removeModifierFromCartItem(cartItemId, modifierId)` - Remove modifier from cart
- `hasRequiredModifiers(itemModifiers, selectedModifiers)` - Check if required modifiers are selected
- `validateModifiers(itemModifiers, selectedModifiers)` - Validate modifier selection

## Usage Examples

### Creating a Modifier Group

```javascript
// Create a "Sauces" modifier group
const response = await fetch('/api/modifier-groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'Sauces',
        description: 'Choose your sauce',
        is_required: false,
        max_selections: 1,
        display_order: 1
    })
});
```

### Adding Modifiers to a Menu Item

```javascript
// Add "Extra Cheese" modifier to a pizza
const response = await fetch('/api/menu-items/123/modifiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        modifier_group_id: 5
    })
});
```

### Applying Modifiers to Cart

```javascript
// Add "Extra Cheese" to cart item
const response = await fetch('/api/cart/add-modifier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        cartItemId: 456,
        modifierId: 10,
        quantity: 1
    })
});
```

## Configuration

### Required Configuration

- Ensure modifier groups are created before adding modifiers
- Set `is_required` to true for mandatory modifier groups
- Configure `max_selections` to limit the number of selections (0 for unlimited)
- Set appropriate `display_order` for proper UI ordering

### Best Practices

1. **Group Logically**: Organize modifiers into logical groups (Sauces, Toppings, Size, etc.)
2. **Price Appropriately**: Set reasonable prices for modifiers
3. **Test Thoroughly**: Test modifier combinations before production use
4. **Document**: Document modifier options for staff training

## Integration

### Cart System
- Ensure cart system properly calculates prices with modifiers
- Display modifier selections clearly in cart
- Include modifier details in order confirmation

### Receipts
- Include modifier details on receipts and invoices
- Show modifier prices separately for transparency

### Inventory
- Track modifier usage for inventory management
- Monitor popular modifiers for menu optimization

### Reporting
- Generate reports on most popular modifiers
- Track modifier revenue contribution
- Analyze modifier usage patterns

## Troubleshooting

### Common Issues

#### Modifiers Not Showing in Cart
- Check if modifier group is assigned to menu item
- Verify menu item is active
- Ensure modifier group is active

#### Price Calculation Incorrect
- Verify modifier prices are set correctly
- Check if quantity is being multiplied correctly
- Review tax calculations on modifiers

#### Required Modifiers Not Enforced
- Confirm `is_required` flag is set to true
- Check validation logic in frontend
- Verify backend validation is working

## Migration

### From Previous Versions

- Existing menu items will not have modifiers by default
- Review menu items and add appropriate modifier groups
- Test modifier pricing calculations
- Train staff on new modifier functionality
