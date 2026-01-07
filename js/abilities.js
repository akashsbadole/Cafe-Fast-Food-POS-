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
        
        // Cannot access Settings
        cannot('manage', 'Settings');
        cannot('manage', 'User');
        cannot('delete', 'Order'); // Cashiers usually can't delete orders without override
    } else {
        // Default / Guest permissions
        can('read', 'MenuItem');
        can('read', 'Category');
    }

    return build();
}

module.exports = { defineAbilityFor };
