# Feature Integration Analysis for Cafe POS System

## Executive Summary

This document provides a comprehensive analysis of the current codebase structure and identifies integration points for the features listed in `todo-future.md`. It includes database schema changes, API endpoint additions, UI component modifications, and a prioritization plan based on complexity and business criticality.

## Current Architecture Overview

### Database Schema (PostgreSQL)

**Current Tables:**
- `users` - User authentication and roles
- `categories` - Menu item categories
- `menu_items` - Menu items with pricing
- `orders` - Order headers
- `order_items` - Order line items
- `kot_tickets` - Kitchen Order Tickets
- `tax_settings` - Tax configuration
- `settings` - System settings
- `locations` (enterprise) - Multi-location support
- `audit_logs` (enterprise) - Audit trail
- `scheduled_reports` (enterprise) - Scheduled reporting
- `report_templates` (enterprise) - Custom reports
- `backup_schedules` (enterprise) - Backup scheduling
- `backup_history` (enterprise) - Backup history
- `system_health` (enterprise) - System monitoring

**Missing Tables for New Features:**
- `modifiers` - Product modifiers/add-ons
- `modifier_groups` - Groups of modifiers
- `modifier_item_mapping` - Menu items to modifier groups
- `tables` - Dine-in table management
- `kot_display` - Digital KOT display tracking
- `combos` - Combo/meal deals
- `combo_items` - Items in combos
- `inventory_recipes` - Bill of Materials (BOM)
- `recipe_items` - Ingredients in recipes
- `loyalty_programs` - Loyalty program definitions
- `customer_loyalty` - Customer loyalty tracking
- `online_order_integrations` - Third-party integration configs
- `online_orders` - Orders from online platforms
- `receipt_preferences` - Digital receipt settings
- `hardware_devices` - Printers and displays
- `cash_drawer_transactions` - Cash drawer reconciliation
- `void_reasons` - Void/refund reason codes
- `split_bills` - Split bill tracking

### Business Logic Modules

**Existing Modules:**
- `cart.js` - Cart management
- `billing.js` - Tax and discount calculation
- `payments.js` - Payment processing
- `kot.js` - Kitchen Order Ticket system
- `order-hold-manager.js` - Order hold/cancel workflow
- `inventory-manager.js` - Inventory tracking
- `reporting-manager.js` - Reporting system
- `token-queue-manager.js` - Customer queue management

**Missing Business Logic:**
- Modifier price calculation
- Table management and seating
- Digital KOT display system
- Combo pricing engine
- Weight-based inventory tracking
- Recipe-based inventory deduction
- Loyalty points calculation
- Online order synchronization
- Digital receipt generation
- Hardware device communication
- Cash drawer reconciliation
- Split bill calculation
- Void/refund workflow with PIN validation

### API Endpoints

**Existing Endpoints:**
- User management (`/api/users`)
- Customer management (`/api/customers`)
- Inventory management (`/api/inventory`)
- Reporting (`/api/reports`)
- Token queue (`/api/token-queue`)
- Supplier management (`/api/suppliers`)
- Purchase orders (`/api/purchase-orders`)
- Order hold/cancel (`/api/orders/:id/hold`, `/api/orders/:id/cancel`)
- Enterprise features (`/api/locations`, `/api/scheduled-reports`)

**Missing Endpoints:**
- Modifier management (`/api/modifiers`)
- Table management (`/api/tables`)
- Digital KOT display (`/api/kot-display`)
- Combo management (`/api/combos`)
- Recipe management (`/api/recipes`)
- Loyalty program management (`/api/loyalty`)
- Online order integration (`/api/online-orders`)
- Digital receipts (`/api/receipts`)
- Hardware device management (`/api/hardware`)
- Cash drawer (`/api/cash-drawer`)
- Split billing (`/api/bills/split`)
- Void/refund workflow (`/api/orders/:id/void`)

### UI Components

**Existing Components:**
- Login screen
- Main POS screen with menu grid
- Cart panel
- KOT display
- Order history
- User management
- Inventory management
- Reporting dashboard
- Token queue management

**Missing UI Components:**
- Modifier selection modal
- Table layout/management
- Digital KOT screen
- Combo builder
- Weight input for inventory
- Recipe management interface
- Loyalty program setup
- Online order sync interface
- Digital receipt options
- Hardware device configuration
- Cash drawer management
- Split bill interface
- Void/refund workflow with PIN

## Feature Integration Analysis

### 1. Coffee/Fast Food Specific Features

#### Product Modifiers/Add-ons

**Database Changes:**
```sql
CREATE TABLE modifier_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT FALSE,
    max_selections INTEGER,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE modifiers (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (group_id) REFERENCES modifier_groups(id)
);

CREATE TABLE menu_item_modifiers (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    modifier_group_id INTEGER NOT NULL,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id),
    UNIQUE (menu_item_id, modifier_group_id)
);

CREATE TABLE order_item_modifiers (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER NOT NULL,
    modifier_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    price REAL NOT NULL,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id),
    FOREIGN KEY (modifier_id) REFERENCES modifiers(id)
);
```

**Business Logic Integration:**
- Modify `cart.js` to handle modifiers
- Update `billing.js` to calculate modifier prices
- Extend `kot.js` to print modifiers on KOT
- Update `inventory-manager.js` to track modifier inventory

**API Endpoints:**
- `GET /api/modifier-groups` - List modifier groups
- `GET /api/modifier-groups/:id` - Get specific group
- `GET /api/modifiers` - List modifiers
- `GET /api/menu-items/:id/modifiers` - Get modifiers for menu item
- `POST /api/orders/items/:id/modifiers` - Add modifiers to order item

**UI Changes:**
- Add modifier selection modal in cart panel
- Show modifier options when adding items to cart
- Display modifiers on order summary
- Update KOT display to show modifiers

**Dependencies:** None

---

#### Table/Buzzer Management

**Database Changes:**
```sql
CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    table_number TEXT UNIQUE NOT NULL,
    capacity INTEGER,
    location_id INTEGER,
    status TEXT DEFAULT 'available',
    current_order_id INTEGER,
    notes TEXT,
    x_position INTEGER,
    y_position INTEGER,
    width INTEGER,
    height INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (current_order_id) REFERENCES orders(id)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buzzer_number TEXT;
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS fk_orders_table
    FOREIGN KEY (table_id) REFERENCES tables(id);
```

**Business Logic Integration:**
- Extend `cart.js` to associate orders with tables
- Update `order-hold-manager.js` to handle table status
- Modify `token-queue-manager.js` to support buzzer numbers

**API Endpoints:**
- `GET /api/tables` - List all tables
- `GET /api/tables/available` - List available tables
- `POST /api/tables` - Create new table
- `PUT /api/tables/:id/order` - Assign order to table
- `PUT /api/tables/:id/status` - Update table status
- `GET /api/tables/grid` - Get table layout for UI

**UI Changes:**
- Add table layout/management screen
- Add table selection in order workflow
- Show table status in order history
- Add buzzer number field in token queue

**Dependencies:** None

---

#### Kitchen Display System (KDS)

**Database Changes:**
```sql
ALTER TABLE kot_tickets ADD COLUMN IF NOT EXISTS display_status TEXT DEFAULT 'pending';
ALTER TABLE kot_tickets ADD COLUMN IF NOT EXISTS assigned_station TEXT;
ALTER TABLE kot_tickets ADD COLUMN IF NOT EXISTS estimated_prep_time INTEGER;
ALTER TABLE kot_tickets ADD COLUMN IF NOT EXISTS actual_prep_time INTEGER;

CREATE TABLE kds_stations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location_id INTEGER,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (location_id) REFERENCES locations(id)
);
```

**Business Logic Integration:**
- Extend `kot.js` with KDS functionality
- Add station assignment logic
- Implement prep time tracking
- Add order bumping (completion) functionality

**API Endpoints:**
- `GET /api/kds/stations` - List KDS stations
- `GET /api/kds/active` - Get active KDS orders
- `POST /api/kds/orders/:id/bump` - Mark order as ready
- `POST /api/kds/orders/:id/assign` - Assign to station
- `GET /api/kds/stats` - Get KDS statistics

**UI Changes:**
- Create dedicated KDS screen
- Add station selection interface
- Implement order bumping buttons
- Show prep time estimates
- Add KDS status to main KOT display

**Dependencies:** Table Management (optional)

---

#### Combo/Meal Deals

**Database Changes:**
```sql
CREATE TABLE combos (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    discount_type TEXT DEFAULT 'fixed',
    discount_value REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE combo_items (
    id SERIAL PRIMARY KEY,
    combo_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    is_optional BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (combo_id) REFERENCES combos(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE TABLE order_combos (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    combo_id INTEGER NOT NULL,
    price REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (combo_id) REFERENCES combos(id)
);
```

**Business Logic Integration:**
- Extend `cart.js` to handle combos
- Update `billing.js` to calculate combo discounts
- Modify `inventory-manager.js` to deduct combo items

**API Endpoints:**
- `GET /api/combos` - List all combos
- `GET /api/combos/active` - List active combos
- `POST /api/combos` - Create new combo
- `POST /api/orders/combos` - Add combo to order
- `GET /api/orders/:id/combos` - Get combos in order

**UI Changes:**
- Add combo section in menu grid
- Create combo builder interface
- Show combo items in cart
- Display combo discount in order summary

**Dependencies:** None

---

#### Weighted Items

**Database Changes:**
```sql
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_weighted BOOLEAN DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS base_price REAL;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_per_unit REAL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS weight REAL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price REAL;
```

**Business Logic Integration:**
- Modify `cart.js` to handle weight input
- Update `billing.js` to calculate weighted prices
- Extend `inventory-manager.js` for weight-based tracking

**API Endpoints:**
- `PUT /api/menu-items/:id/weighted` - Set item as weighted
- `POST /api/orders/items/weighted` - Add weighted item to order

**UI Changes:**
- Add weight input field in menu grid
- Show price per unit in cart
- Display total weight in order summary

**Dependencies:** None

---

### 2. Operational & Resiliency Features

#### Offline Mode Synchronization

**Database Changes:**
```sql
CREATE TABLE sync_queue (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    data JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_at TIMESTAMP
);

CREATE TABLE local_cache (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    data JSONB NOT NULL,
    is_dirty BOOLEAN DEFAULT FALSE,
    last_sync TIMESTAMP,
    UNIQUE (entity_type, entity_id)
);
```

**Business Logic Integration:**
- Implement service worker for offline caching
- Add queue-based synchronization
- Create conflict resolution logic
- Implement local-first data strategy

**API Endpoints:**
- `GET /api/sync/status` - Check sync status
- `POST /api/sync/force` - Force sync
- `GET /api/sync/queue` - Get pending sync items
- `GET /api/offline/data` - Get cached data

**UI Changes:**
- Add offline mode indicator
- Show sync status in UI
- Implement queue management interface
- Add conflict resolution dialogs

**Dependencies:** None (foundational)

---

#### Split Billing

**Database Changes:**
```sql
CREATE TABLE split_bills (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    split_count INTEGER NOT NULL,
    split_type TEXT DEFAULT 'equal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE split_bill_items (
    id SERIAL PRIMARY KEY,
    split_bill_id INTEGER NOT NULL,
    order_item_id INTEGER NOT NULL,
    split_id INTEGER NOT NULL,
    allocated_amount REAL NOT NULL,
    FOREIGN KEY (split_bill_id) REFERENCES split_bills(id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

CREATE TABLE split_payments (
    id SERIAL PRIMARY KEY,
    split_bill_id INTEGER NOT NULL,
    split_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_mode TEXT NOT NULL,
    transaction_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (split_bill_id) REFERENCES split_bills(id)
);
```

**Business Logic Integration:**
- Extend `billing.js` with split calculation
- Modify `payments.js` to handle multiple payments
- Update `cart.js` to manage split items

**API Endpoints:**
- `POST /api/orders/:id/split` - Create split bill
- `GET /api/orders/:id/splits` - Get split details
- `POST /api/splits/:id/pay` - Process split payment
- `GET /api/splits/:id/receipt` - Generate split receipt

**UI Changes:**
- Add split bill button in checkout
- Create split allocation interface
- Show individual split totals
- Generate separate receipts for splits

**Dependencies:** None

---

#### Void/Refund Workflow

**Database Changes:**
```sql
CREATE TABLE void_reasons (
    id SERIAL PRIMARY KEY,
    reason TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_reason_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_by INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_notes TEXT;
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS fk_orders_void_reason
    FOREIGN KEY (void_reason_id) REFERENCES void_reasons(id);
```

**Business Logic Integration:**
- Extend `order-hold-manager.js` with void workflow
- Add PIN validation for void operations
- Implement audit logging for voids
- Update `inventory-manager.js` to handle void inventory

**API Endpoints:**
- `GET /api/void-reasons` - List void reasons
- `POST /api/void-reasons` - Add new void reason
- `POST /api/orders/:id/void` - Void order with PIN
- `POST /api/orders/:id/refund` - Process refund

**UI Changes:**
- Add void button in order history
- Create PIN prompt for void operations
- Show void reason selection
- Display void audit trail

**Dependencies:** None

---

#### Cash Drawer Reconciliation

**Database Changes:**
```sql
CREATE TABLE cash_drawers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location_id INTEGER,
    current_balance REAL DEFAULT 0,
    opening_balance REAL,
    closing_balance REAL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE cash_drawer_transactions (
    id SERIAL PRIMARY KEY,
    drawer_id INTEGER NOT NULL,
    order_id INTEGER,
    amount REAL NOT NULL,
    transaction_type TEXT NOT NULL,
    reference TEXT,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (drawer_id) REFERENCES cash_drawers(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE shift_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    drawer_id INTEGER NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    opening_amount REAL NOT NULL,
    closing_amount REAL,
    expected_amount REAL,
    discrepancy REAL,
    notes TEXT,
    status TEXT DEFAULT 'open',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (drawer_id) REFERENCES cash_drawers(id)
);
```

**Business Logic Integration:**
- Extend `payments.js` with cash drawer tracking
- Add shift management to `cart.js`
- Implement reconciliation calculations
- Add audit logging for cash movements

**API Endpoints:**
- `GET /api/cash-drawers` - List cash drawers
- `POST /api/shifts/start` - Start new shift
- `POST /api/shifts/end` - End shift with reconciliation
- `GET /api/shifts/current` - Get current shift
- `GET /api/shifts/report` - Get shift report
- `POST /api/cash-drawer/override` - Manual override (admin only)

**UI Changes:**
- Add cash drawer management screen
- Show shift status in UI
- Create reconciliation interface
- Add discrepancy reporting

**Dependencies:** None

---

### 3. Partial Features That Need Enhancement

#### Inventory "Recipes" (BOM)

**Database Changes:**
```sql
CREATE TABLE inventory_recipes (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE (menu_item_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE TABLE recipe_items (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL,
    ingredient_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    waste_percentage REAL DEFAULT 0,
    FOREIGN KEY (recipe_id) REFERENCES inventory_recipes(id),
    FOREIGN KEY (ingredient_id) REFERENCES menu_items(id)
);
```

**Business Logic Integration:**
- Extend `inventory-manager.js` with recipe-based deduction
- Add recipe validation before sale
- Implement waste percentage calculations
- Update low stock alerts based on recipes

**API Endpoints:**
- `GET /api/recipes` - List all recipes
- `GET /api/menu-items/:id/recipe` - Get recipe for item
- `POST /api/recipes` - Create/update recipe
- `POST /api/orders/validate-inventory` - Check inventory for order

**UI Changes:**
- Add recipe management interface
- Show recipe coverage in inventory
- Add recipe-based low stock alerts
- Display recipe details in item management

**Dependencies:** None

---

#### Tax Engine Enhancement

**Database Changes:**
```sql
ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS is_inclusive BOOLEAN DEFAULT FALSE;
ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS applies_to TEXT DEFAULT 'all';

CREATE TABLE tax_item_mapping (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    tax_setting_id INTEGER NOT NULL,
    UNIQUE (menu_item_id, tax_setting_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    FOREIGN KEY (tax_setting_id) REFERENCES tax_settings(id)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_breakdown JSONB;
```

**Business Logic Integration:**
- Extend `billing.js` with inclusive/exclusive tax logic
- Add tax breakdown calculations
- Implement item-specific tax rules
- Update reporting to show tax details

**API Endpoints:**
- `GET /api/tax/calculate` - Calculate tax for order
- `GET /api/tax/breakdown` - Get tax breakdown
- `PUT /api/menu-items/:id/tax` - Set item tax rules

**UI Changes:**
- Add tax type selection in settings
- Show tax breakdown in order summary
- Add item-specific tax configuration
- Display tax details in reports

**Dependencies:** None

---

#### Customer Loyalty Enhancement

**Database Changes:**
```sql
CREATE TABLE loyalty_programs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    points_per_currency REAL NOT NULL,
    redemption_rate REAL NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    min_purchase REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE loyalty_tiers (
    id SERIAL PRIMARY KEY,
    program_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    min_points INTEGER NOT NULL,
    discount_percentage REAL DEFAULT 0,
    free_item_limit INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id)
);

CREATE TABLE customer_loyalty (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    program_id INTEGER NOT NULL,
    points_balance INTEGER DEFAULT 0,
    current_tier_id INTEGER,
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, program_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id),
    FOREIGN KEY (current_tier_id) REFERENCES loyalty_tiers(id)
);

CREATE TABLE loyalty_transactions (
    id SERIAL PRIMARY KEY,
    customer_loyalty_id INTEGER NOT NULL,
    order_id INTEGER,
    points INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    reference TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_loyalty_id) REFERENCES customer_loyalty(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE loyalty_punch_cards (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    program_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    current_stamps INTEGER DEFAULT 0,
    required_stamps INTEGER NOT NULL,
    reward_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id),
    FOREIGN KEY (item_id) REFERENCES menu_items(id)
);
```

**Business Logic Integration:**
- Extend `billing.js` with loyalty point calculation
- Add `loyalty-manager.js` module
- Update `customer` module to track loyalty
- Implement redemption workflow

**API Endpoints:**
- `GET /api/loyalty/programs` - List loyalty programs
- `GET /api/customers/:id/loyalty` - Get customer loyalty status
- `POST /api/loyalty/earn` - Earn points from order
- `POST /api/loyalty/redeem` - Redeem points
- `GET /api/loyalty/punch-cards` - Get punch card status
- `POST /api/loyalty/punch` - Add stamp to punch card

**UI Changes:**
- Add loyalty program management
- Show points balance in customer lookup
- Add redemption interface in checkout
- Display punch card status
- Show loyalty tier benefits

**Dependencies:** None

---

### 4. Integration Features (Revenue Drivers)

#### Online Order Integration

**Database Changes:**
```sql
CREATE TABLE online_integration_providers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    api_endpoint TEXT,
    auth_token TEXT,
    webhook_secret TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE online_orders (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    external_order_id TEXT UNIQUE NOT NULL,
    order_number TEXT,
    status TEXT DEFAULT 'pending',
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    delivery_address TEXT,
    special_instructions TEXT,
    estimated_delivery TIMESTAMP,
    actual_delivery TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES online_integration_providers(id)
);

CREATE TABLE online_order_items (
    id SERIAL PRIMARY KEY,
    online_order_id INTEGER NOT NULL,
    menu_item_id INTEGER,
    name TEXT,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    special_instructions TEXT,
    FOREIGN KEY (online_order_id) REFERENCES online_orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE TABLE online_order_sync_log (
    id SERIAL PRIMARY KEY,
    online_order_id INTEGER NOT NULL,
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL,
    response_data JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (online_order_id) REFERENCES online_orders(id)
);
```

**Business Logic Integration:**
- Create `online-order-manager.js` module
- Extend `inventory-manager.js` for online order validation
- Add webhook handler for incoming orders
- Implement sync status tracking

**API Endpoints:**
- `GET /api/online-providers` - List integration providers
- `POST /api/online-providers` - Add new provider
- `GET /api/online-orders` - List online orders
- `POST /api/online-orders/sync` - Sync orders
- `POST /api/webhooks/:provider` - Webhook endpoint
- `GET /api/online-orders/:id` - Get order details

**UI Changes:**
- Add online order dashboard
- Show sync status indicators
- Add order import interface
- Display online vs in-store orders

**Dependencies:** None

---

#### Digital Receipts

**Database Changes:**
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_attempts INTEGER DEFAULT 0;

CREATE TABLE receipt_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT,
    body_html TEXT NOT NULL,
    body_text TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE receipt_sending_log (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL,
    recipient TEXT,
    message_id TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

**Business Logic Integration:**
- Extend `billing.js` with digital receipt generation
- Add `receipt-manager.js` module
- Implement email/WhatsApp sending
- Add retry logic for failed sends

**API Endpoints:**
- `GET /api/receipts/templates` - List receipt templates
- `POST /api/receipts/send` - Send digital receipt
- `GET /api/receipts/log` - Get sending history
- `POST /api/receipts/resend` - Resend receipt

**UI Changes:**
- Add receipt preference selection in checkout
- Show receipt sending status
- Add template management interface
- Display send history in order details

**Dependencies:** None

---

#### Hardware Drivers

**Database Changes:**
```sql
CREATE TABLE hardware_devices (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    connection_type TEXT NOT NULL,
    ip_address TEXT,
    port INTEGER,
    com_port TEXT,
    printer_model TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    location_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE hardware_device_log (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    details JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES hardware_devices(id)
);
```

**Business Logic Integration:**
- Create `hardware-manager.js` module
- Implement ESC/POS printer protocol
- Add customer display interface
- Create device health monitoring

**API Endpoints:**
- `GET /api/hardware/devices` - List devices
- `POST /api/hardware/devices` - Add device
- `POST /api/hardware/print` - Send print job
- `POST /api/hardware/display` - Update customer display
- `GET /api/hardware/status` - Get device status

**UI Changes:**
- Add hardware configuration screen
- Show device status in UI
- Add test print functionality
- Display connection errors

**Dependencies:** None

---

## Architecture Limitations

### Current Limitations

1. **Database Schema Limitations:**
   - No support for nested product modifiers
   - Limited tax calculation flexibility
   - No recipe-based inventory management
   - Basic order structure without combo support

2. **Business Logic Limitations:**
   - Cart system doesn't handle modifiers
   - Billing doesn't support split payments
   - Inventory doesn't track recipes
   - No offline mode support

3. **API Limitations:**
   - No webhook support for integrations
   - Limited reporting capabilities
   - No digital receipt generation
   - Basic hardware device management

4. **UI Limitations:**
   - No modifier selection interface
   - Basic table management
   - Limited KOT display capabilities
   - No combo builder

5. **Operational Limitations:**
   - No cash drawer reconciliation
   - Basic void/refund workflow
   - No offline mode
   - Limited audit logging

## Integration Strategy

### Phase 1: Foundation (High Priority)
- **Offline Mode Synchronization** - Critical for system reliability
- **Cash Drawer Reconciliation** - Essential for financial accuracy
- **Void/Refund Workflow** - Required for proper order management
- **Tax Engine Enhancement** - Needed for compliance

### Phase 2: Core Features (Medium Priority)
- **Product Modifiers** - Essential for menu flexibility
- **Table/Buzzer Management** - Important for dine-in operations
- **Kitchen Display System** - Enhances kitchen efficiency
- **Combo/Meal Deals** - Drives sales and customer value
- **Inventory Recipes (BOM)** - Critical for inventory accuracy

### Phase 3: Enhancements (Medium Priority)
- **Weighted Items** - Needed for certain product types
- **Customer Loyalty** - Drives repeat business
- **Split Billing** - Improves customer experience
- **Digital Receipts** - Modernizes operations
- **Hardware Drivers** - Enables better hardware integration

### Phase 4: Advanced Features (Low Priority)
- **Online Order Integration** - Nice to have for expansion
- **Advanced Reporting** - Enhances analytics

## Dependency Analysis

### Independent Features (Can be implemented separately)
- Product Modifiers
- Table/Buzzer Management
- Combo/Meal Deals
- Weighted Items
- Customer Loyalty
- Digital Receipts
- Hardware Drivers
- Online Order Integration

### Dependent Features
- **Kitchen Display System** - Depends on Table Management (optional)
- **Inventory Recipes (BOM)** - Enhances but doesn't depend on Modifiers
- **Split Billing** - Works with existing order structure
- **Void/Refund Workflow** - Extends existing order management
- **Cash Drawer Reconciliation** - Works with existing payment system
- **Tax Engine Enhancement** - Extends existing tax system

### Foundational Features (Must be implemented first)
- **Offline Mode Synchronization** - Affects all other features
- **Database Schema Changes** - Required before most features

## Prioritization Plan

### Priority Matrix

| Feature | Complexity | Business Criticality | Priority | Dependencies | Estimated Effort |
|---------|-----------|---------------------|----------|---------------|------------------|
| Offline Mode Sync | High | Critical | 1 | None | High |
| Cash Drawer Reconciliation | Medium | Critical | 2 | None | Medium |
| Void/Refund Workflow | Medium | Critical | 3 | None | Medium |
| Tax Engine Enhancement | Medium | Critical | 4 | None | Medium |
| Product Modifiers | High | High | 5 | None | High |
| Table/Buzzer Management | Medium | High | 6 | None | Medium |
| Kitchen Display System | High | High | 7 | Table Mgmt (opt) | High |
| Combo/Meal Deals | Medium | High | 8 | None | Medium |
| Inventory Recipes (BOM) | High | High | 9 | None | High |
| Weighted Items | Low | Medium | 10 | None | Low |
| Customer Loyalty | High | Medium | 11 | None | High |
| Split Billing | Medium | Medium | 12 | None | Medium |
| Digital Receipts | Medium | Medium | 13 | None | Medium |
| Hardware Drivers | High | Medium | 14 | None | High |
| Online Order Integration | High | Low | 15 | None | High |

### Implementation Roadmap

**Phase 1: Foundation (4-6 weeks)**
1. Offline Mode Synchronization
2. Cash Drawer Reconciliation
3. Void/Refund Workflow
4. Tax Engine Enhancement

**Phase 2: Core Features (6-8 weeks)**
5. Product Modifiers
6. Table/Buzzer Management
7. Kitchen Display System
8. Combo/Meal Deals
9. Inventory Recipes (BOM)

**Phase 3: Enhancements (4-6 weeks)**
10. Weighted Items
11. Customer Loyalty
12. Split Billing
13. Digital Receipts
14. Hardware Drivers

**Phase 4: Advanced (4-6 weeks)**
15. Online Order Integration

## Risk Assessment

### High Risk Items
1. **Offline Mode Synchronization**
   - Risk: Data corruption, sync conflicts
   - Mitigation: Implement robust conflict resolution, thorough testing

2. **Cash Drawer Reconciliation**
   - Risk: Financial discrepancies
   - Mitigation: Comprehensive audit logging, admin overrides

3. **Online Order Integration**
   - Risk: Third-party API changes
   - Mitigation: Versioned API contracts, webhook validation

### Medium Risk Items
1. **Product Modifiers**
   - Risk: Complex pricing calculations
   - Mitigation: Unit testing, pricing validation

2. **Kitchen Display System**
   - Risk: Kitchen workflow disruption
   - Mitigation: Pilot testing, user feedback

3. **Inventory Recipes (BOM)**
   - Risk: Inventory accuracy issues
   - Mitigation: Recipe validation, waste percentage testing

## Testing Strategy

### Unit Testing
- Business logic modules
- API endpoint validation
- Database schema integrity
- Calculation accuracy (tax, discounts, modifiers)

### Integration Testing
- Offline mode sync scenarios
- Cash drawer reconciliation flows
- Online order integration
- Hardware device communication

### End-to-End Testing
- Complete order workflow
- Modifier selection and pricing
- Table management and KOT
- Combo ordering and discounts
- Loyalty point earning and redemption

### User Acceptance Testing
- Kitchen staff workflow
- Cashier operations
- Manager reporting
- Owner financial reconciliation

## Migration Plan

### Database Migration
1. Create new tables for each feature
2. Add columns to existing tables
3. Backfill data where possible
4. Test migration scripts thoroughly
5. Provide rollback capability

### Code Migration
1. Feature branches for each major feature
2. Integration testing before merge
3. Gradual rollout of features
4. Feature flags for optional features
5. Backward compatibility where possible

### Data Migration
1. Export existing data
2. Transform to new schema
3. Import to new tables
4. Verify data integrity
5. Provide data repair tools

## Conclusion

This comprehensive analysis provides a clear roadmap for integrating the features listed in `todo-future.md`. The implementation should proceed in phases, starting with foundational features that ensure system reliability and financial accuracy, followed by core features that enhance operational efficiency, and finally advanced features that drive business growth.

Each feature has been analyzed for database requirements, business logic changes, API endpoints, and UI modifications. The prioritization plan balances complexity, business criticality, and dependencies to ensure a smooth implementation process.
