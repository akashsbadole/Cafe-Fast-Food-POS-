const { AbilityBuilder, Ability, createMongoAbility } = require('@casl/ability');

function defineAbilityFor(user) {
    const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

    if (user.role === 'admin' || (user.permissions && user.permissions.includes('manage_all'))) {
        can('manage', 'all');
    } else if (user.role === 'cashier') {
        // Cashier permissions
        can('read', 'MenuItem');
        can('read', 'Category');

        can('create', 'Order');
        can('read', 'Order', { user_id: user.id }); // Can see own orders? Or all? Usually all for POS.
        can('read', 'Order'); // Let's say all for now.
        can('update', 'Order', { status: 'pending' }); // Can update pending orders

        can('create', 'KOT');
        can('read', 'KOT');

        can('read', 'Tax');

        // Table permissions
        can('read', 'Table');
        can('update', 'Table', ['status']); // Can update table status

        // KDS permissions
        can('read', 'KdsStation');
        can('read', 'KdsOrder');
        can('create', 'KdsOrder'); // Can submit orders to KDS
        can('update', 'KdsOrder', ['status']); // Can update order status
        can('update', 'KdsItem', ['status']); // Can update item status

        // Inventory permissions for cashiers
        can('read', 'Inventory');
        can('read', 'InventoryItem');
        can('read', 'InventoryTransaction');

        // Customer permissions
        can('read', 'Customer');
        can('create', 'Customer');
        can('update', 'Customer');

        // Settings permissions (read-only for cashiers)
        can('read', 'Settings');

        // Cannot access sensitive operations
        cannot('manage', 'User');
        cannot('manage', 'Role');
        cannot('delete', 'Order'); // Cashiers usually can't delete orders without override
        cannot('manage', 'Backup');
        cannot('manage', 'System');
    } else {
        // Default / Guest permissions
        can('read', 'MenuItem');
        can('read', 'Category');
    }

    return build();
}

module.exports = { defineAbilityFor };
