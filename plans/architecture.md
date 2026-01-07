# Cafe POS System - Technical Architecture

## 📁 Project Structure

```
cafe-pos/
├── package.json
├── electron.js
├── preload.js
├── main.js
├── index.html
├── styles/
│   ├── main.css
│   ├── components.css
│   ├── pos.css
│   ├── kot.css
│   └── themes.css
├── js/
│   ├── app.js
│   ├── database.js
│   ├── auth.js
│   ├── menu.js
│   ├── cart.js
│   ├── billing.js
│   ├── kot.js
│   ├── history.js
│   ├── payments.js
│   ├── utils.js
│   └── ui.js
├── images/
│   ├── logo.png
│   └── icons/
├── data/
│   └── database.sqlite
└── plans/
    └── architecture.md
```

## 🗄️ Database Schema (SQLite)

### Tables

1. **users**
   - id INTEGER PRIMARY KEY
   - username TEXT UNIQUE
   - password_hash TEXT
   - pin_hash TEXT
   - role TEXT (admin/cashier)
   - created_at DATETIME
   - last_login DATETIME

2. **categories**
   - id INTEGER PRIMARY KEY
   - name TEXT UNIQUE
   - display_order INTEGER
   - icon TEXT
   - is_active BOOLEAN DEFAULT 1

3. **menu_items**
   - id INTEGER PRIMARY KEY
   - category_id INTEGER REFERENCES categories(id)
   - name TEXT
   - description TEXT
   - price DECIMAL(10,2)
   - image TEXT
   - is_available BOOLEAN DEFAULT 1
   - created_at DATETIME
   - updated_at DATETIME

4. **orders**
   - id INTEGER PRIMARY KEY
   - order_number TEXT UNIQUE
   - subtotal DECIMAL(10,2)
   - discount_amount DECIMAL(10,2)
   - discount_type TEXT (percentage/fixed)
   - tax_amount DECIMAL(10,2)
   - tax_rate DECIMAL(5,2)
   - total_amount DECIMAL(10,2)
   - payment_mode TEXT (cash/upi/card)
   - payment_status TEXT (paid/unpaid)
   - status TEXT (pending/preparing/ready/served)
   - notes TEXT
   - created_at DATETIME
   - updated_at DATETIME

5. **order_items**
   - id INTEGER PRIMARY KEY
   - order_id INTEGER REFERENCES orders(id)
   - menu_item_id INTEGER REFERENCES menu_items(id)
   - quantity INTEGER
   - unit_price DECIMAL(10,2)
   - total_price DECIMAL(10,2)
   - notes TEXT

6. **kot_tickets**
   - id INTEGER PRIMARY KEY
   - order_id INTEGER REFERENCES orders(id)
   - ticket_number TEXT
   - status TEXT (pending/preparing/ready/served)
   - notes TEXT
   - created_at DATETIME
   - updated_at DATETIME

7. **tax_settings**
   - id INTEGER PRIMARY KEY
   - name TEXT
   - rate DECIMAL(5,2)
   - is_active BOOLEAN DEFAULT 1

8. **settings**
   - key TEXT PRIMARY KEY
   - value TEXT
   - updated_at DATETIME

## 🎨 UI/UX Design

### Screen Layouts

#### 1. Login Screen
- Centered login form
- PIN input (4-6 digits)
- Show/hide password toggle
- Auto-lock status indicator

#### 2. Main POS Screen
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Logo | Current Time | User | Theme Toggle | Settings│
├───────────────┬─────────────────────────────────────────────┤
│               │ Cart Panel                                 │
│ Categories    │ ┌─────────────────────────────────────────┐│
│ [Coffee]      │ │ Items in Cart                           ││
│ [Tea]         │ │ ─────────────────────────────────────── ││
│ [Snacks]      │ │ Item 1     Qty: 2    ₹80              ││
│ [Fast-Food]   │ │ Item 2     Qty: 1    ₹120             ││
│ [Cold Bev]    │ │ ─────────────────────────────────────── ││
│ [Meals]       │ │                           Subtotal: ₹200││
│               │ │                           Discount: ₹0  ││
│ Menu Grid     │ │                              Tax: ₹18  ││
│ ┌───────────┐ │ │                           TOTAL: ₹218 ││
│ │ Item      │ │ │                                         ││
│ │ ₹40       │ │ │ [Checkout] [Clear Cart]                ││
│ └───────────┘ │ └─────────────────────────────────────────┘│
│ ┌───────────┐ │ KOT Status: Pending                       │
│ │ Item      │ │ [Send to Kitchen]                         │
│ │ ₹50       │ │                                         ││
│ └───────────┘ │                                         ││
│               │                                         ││
│ [Search...]  │                                         ││
└───────────────┴─────────────────────────────────────────────┘
```

#### 3. Kitchen Display (KOT)
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Kitchen Order Tickets | Current Orders              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│ │ #KOT-001  │  │ #KOT-002  │  │ #KOT-003  │               │
│ │ Status:   │  │ Status:   │  │ Status:   │               │
│ │ PENDING   │  │ PREPARING │  │ READY     │               │
│ │ ───────── │  │ ───────── │  │ ───────── │               │
│ │ 2x Coffee │  │ 1x Burger │  │ 1x Pizza  │               │
│ │ 1x Tea    │  │ 2x Fries  │  │ 1x Cold   │               │
│ │ Notes:    │  │ Notes:    │  │ Notes:    │               │
│ │ No sugar  │  │ Extra cheese│ │ Less ice  │               │
│ │ ───────── │  │ ───────── │  │ ───────── │               │
│ │ Time:     │  │ Time:     │  │ Time:     │               │
│ │ 10:30 AM  │  │ 10:25 AM  │  │ 10:20 AM  │               │
│ │ [Start]   │  │ [Ready]   │  │ [Served]  │               │
│ └───────────┘  └───────────┘  └───────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4. Menu Management
- Table view of all menu items
- Add/Edit/Delete buttons
- Category filter
- Search functionality
- Toggle availability switch
- Image upload option

#### 5. Order History
- List of past orders
- Filter by: Today, Date Range, Order Number
- View bill details
- Reprint capability

## 🔐 Security Architecture

### Authentication Flow
1. User enters PIN on login screen
2. Verify against encrypted PIN hash
3. On success, create session token
4. Track user activity for auto-lock
5. Lock screen after 60-120 seconds idle
6. Require PIN re-entry to unlock

### Data Protection
- Store PIN/password using bcrypt
- Encrypt sensitive database fields
- Use SQLite with file-level encryption
- Prevent SQL injection with parameterized queries

## 🔧 Module Architecture

### Main Process (main.js)
- Window management
- Database initialization
- Global event handlers
- Auto-lock timer
- IPC communication

### Renderer Process (UI)
- Single Page Application structure
- State management using vanilla JS objects
- Event delegation for performance
- LocalStorage for user preferences

### Module Responsibilities

#### database.js
- Initialize SQLite database
- Create tables with schema
- CRUD operations for all entities
- Transaction support

#### auth.js
- PIN verification
- Session management
- Auto-lock functionality
- User preferences

#### menu.js
- Category management
- Menu item CRUD
- Availability toggling
- Search functionality

#### cart.js
- Add/remove items
- Quantity management
- Subtotal calculation
- Discount application

#### billing.js
- Tax calculation
- Discount calculation
- Final amount computation
- Bill generation

#### kot.js
- Create KOT tickets
- Update ticket status
- Kitchen display
- Order tracking

#### payments.js
- Payment mode selection
- Payment recording
- Status updates

#### history.js
- Order listing
- Filtering and search
- Bill viewing
- Reprinting

#### ui.js
- Theme switching
- Component rendering
- Event handlers
- Responsive layout

#### utils.js
- Date formatting
- Currency formatting
- Validation
- Encryption helpers

## 🎯 Implementation Phases

### Phase 1: Foundation
1. Set up project structure
2. Create package.json with dependencies
3. Implement database schema
4. Build basic HTML structure
5. Create core CSS styles

### Phase 2: Authentication
1. Login screen UI
2. PIN verification logic
3. Auto-lock mechanism
4. Session management

### Phase 3: Menu Management
1. Category CRUD
2. Menu item CRUD
3. Search functionality
4. Availability toggle

### Phase 4: POS Interface
1. Category tabs
2. Menu grid display
3. Cart panel
4. Quantity controls
5. Discount application

### Phase 5: Billing
1. Tax calculation
2. Final amount computation
3. Bill generation
4. Print format

### Phase 6: KOT System
1. KOT creation
2. Kitchen display UI
3. Status management
4. Order tracking

### Phase 7: Payment
1. Payment mode selection
2. Payment recording
3. Order status update

### Phase 8: History
1. Order list view
2. Filtering
3. Bill details
4. Search functionality

### Phase 9: Polish
1. Theme support (dark/light)
2. Responsive design
3. Sample data
4. Testing and fixes

## 📦 Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "bcryptjs": "^2.4.3",
    "electron": "^28.0.0"
  },
  "devDependencies": {
    "electron-builder": "^24.9.1"
  }
}
```

## 🖨️ Bill Print Format

```
╔════════════════════════════════════════╗
║           ☕ COFFEE CAFE               ║
║        Taste the Difference            ║
╠════════════════════════════════════════╣
║ GST No: 27AABCD1234D1Z5               ║
║ ───────────────────────────────────────║
║ Item                    Qty    Price   ║
║ ───────────────────────────────────────║
║ Espresso Coffee         2     ₹160.00  ║
║ Chocolate Croissant     1      ₹85.00  ║
║ ───────────────────────────────────────║
║ Subtotal:                     ₹245.00  ║
║ Discount:                       ₹0.00  ║
║ CGST (9%):                    ₹22.05  ║
║ SGST (9%):                    ₹22.05  ║
╠════════════════════════════════════════╣
║ TOTAL:                           ₹289.10║
╠════════════════════════════════════════╣
║ Payment Mode: UPI                   ║
║ Order No: ORD-2024-0001             ║
║ Date: 07-01-2026  Time: 10:30 AM    ║
╠════════════════════════════════════════╣
║        Thank you! Visit Again!        ║
╚════════════════════════════════════════╝
```

## ✅ Acceptance Criteria

- [ ] App launches without errors
- [ ] Login with PIN works
- [ ] Auto-lock activates after inactivity
- [ ] Menu items can be added/edited/deleted
- [ ] Categories filter menu items
- [ ] Cart operations (add/remove/update quantity)
- [ ] Discount and tax calculation correct
- [ ] Bill generation and print works
- [ ] KOT tickets create and update correctly
- [ ] Payment modes record properly
- [ ] Order history shows past orders
- [ ] Search functionality works
- [ ] Dark/light theme toggles correctly
- [ ] Responsive layout works on 1366×768
- [ ] Sample data loads successfully
