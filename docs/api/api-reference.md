# Cafe POS System - API Reference

## Overview

This document provides comprehensive API documentation for all endpoints in the Cafe POS System, including the 14 newly implemented features.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Most endpoints require authentication using JWT tokens.

### Authentication Header

```
Authorization: Bearer <token>
```

### Getting a Token

```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "pin": "1234"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "details": {
      "field": "error message"
    }
  }
}
```

### Common Error Codes

- `400 Bad Request` - Invalid input data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## API Endpoints

### 1. Authentication & Users

#### `POST /api/auth/login`
**Login**

**Request:**
```json
{
  "username": "admin",
  "pin": "1234"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

#### `GET /api/users`
**List all users**

**Response:**
```json
[
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "is_active": true
  }
]
```

#### `POST /api/users`
**Create new user**

**Request:**
```json
{
  "username": "cashier1",
  "pin": "5678",
  "role": "cashier",
  "is_active": true
}
```

### 2. Product Modifiers

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
    "is_active": true
  }
]
```

#### `POST /api/modifier-groups`
**Create modifier group**

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
    "is_active": true
  }
]
```

#### `POST /api/modifiers`
**Create modifier**

**Request:**
```json
{
  "group_id": 1,
  "name": "Extra Cheese",
  "price": 0.50,
  "display_order": 1
}
```

#### `GET /api/menu-items/:id/modifiers`
**Get modifiers for menu item**

**Response:**
```json
[
  {
    "id": 1,
    "name": "Sauces",
    "modifiers": [
      {"id": 1, "name": "Ketchup", "price": 0.00},
      {"id": 2, "name": "Mayo", "price": 0.00}
    ]
  }
]
```

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
    "total": 6.49,
    "modifiers": [
      {"id": 1, "name": "Extra Cheese", "price": 0.50, "quantity": 1}
    ]
  }
}
```

### 3. Table & Buzzer Management

#### `GET /api/tables`
**List all tables**

**Response:**
```json
[
  {
    "id": 1,
    "table_number": "T01",
    "name": "Table 1",
    "capacity": 4,
    "status": "available",
    "location_id": 1
  }
]
```

#### `POST /api/tables`
**Create table**

**Request:**
```json
{
  "table_number": "T01",
  "name": "Table 1",
  "capacity": 4,
  "location_id": 1
}
```

#### `GET /api/buzzers`
**List all buzzers**

**Response:**
```json
[
  {
    "id": 1,
    "buzzer_number": "B01",
    "status": "available"
  }
]
```

#### `POST /api/buzzers`
**Create buzzer**

**Request:**
```json
{
  "buzzer_number": "B01"
}
```

#### `POST /api/orders/:id/assign-table`
**Assign table to order**

**Request:**
```json
{
  "table_id": 1
}
```

#### `POST /api/orders/:id/assign-buzzer`
**Assign buzzer to order**

**Request:**
```json
{
  "buzzer_id": 1
}
```

### 4. Kitchen Display System (KDS)

#### `GET /api/kds/stations`
**List all KDS stations**

**Response:**
```json
[
  {
    "station_id": 1,
    "name": "grill",
    "display_name": "Grill Station",
    "position": 1,
    "is_active": true
  }
]
```

#### `POST /api/kds/stations`
**Create KDS station**

**Request:**
```json
{
  "name": "grill",
  "display_name": "Grill Station",
  "position": 1,
  "is_active": true
}
```

#### `POST /api/kds/orders`
**Submit order to KDS**

**Request:**
```json
{
  "orderId": 123,
  "tableId": 1,
  "customerName": "John Doe",
  "orderType": "dine_in",
  "items": [
    {
      "orderItemId": 456,
      "productId": 789,
      "productName": "Cheeseburger",
      "quantity": 2,
      "stationId": 1,
      "notes": "Extra cheese"
    }
  ],
  "priority": false,
  "notes": "Table by window"
}
```

#### `GET /api/kds/orders`
**List KDS orders**

**Query Parameters:**
- `status`: Filter by status (received, in-progress, ready, completed)
- `stationId`: Filter by station
- `priorityOnly`: Show only priority orders
- `limit`: Limit number of results

**Response:**
```json
[
  {
    "kds_order_id": 1,
    "order_id": 123,
    "status": "received",
    "created_at": "2026-01-20T10:00:00Z",
    "items": [
      {
        "kds_item_id": 1,
        "product_name": "Cheeseburger",
        "quantity": 2,
        "status": "received",
        "station_id": 1
      }
    ]
  }
]
```

#### `PUT /api/kds/items/:id/status`
**Update item status**

**Request:**
```json
{
  "status": "in-progress",
  "changedBy": "chef1",
  "changeReason": "Started preparation"
}
```

#### `PUT /api/kds/orders/:id/status`
**Update order status**

**Request:**
```json
{
  "status": "completed",
  "changedBy": "chef1",
  "changeReason": "Order completed"
}
```

### 5. Combo/Meal Deals

#### `GET /api/combos`
**List all active combos**

**Response:**
```json
[
  {
    "id": 1,
    "name": "Big Meal Deal",
    "description": "Burger + Fries + Drink",
    "combo_code": "MEAL001",
    "is_active": true,
    "items": [
      {
        "id": 1,
        "menu_item_id": 123,
        "is_required": true,
        "min_quantity": 1,
        "item_name": "Cheeseburger",
        "item_price": 5.99
      }
    ],
    "pricing": [
      {
        "id": 1,
        "price": 8.99,
        "is_active": true
      }
    ]
  }
]
```

#### `POST /api/combos`
**Create combo deal**

**Request:**
```json
{
  "name": "Big Meal Deal",
  "description": "Burger + Fries + Drink",
  "combo_code": "MEAL001",
  "min_quantity": 1,
  "max_quantity": 1,
  "allow_customization": true,
  "has_discount": true,
  "discount_type": "fixed",
  "discount_value": 2.50,
  "is_predefined": true
}
```

#### `POST /api/combos/:id/items`
**Add item to combo**

**Request:**
```json
{
  "menuItemId": 123,
  "isRequired": true,
  "minQuantity": 1,
  "maxQuantity": 1,
  "displayOrder": 1
}
```

#### `POST /api/combos/find-applicable`
**Find applicable combos in cart**

**Request:**
```json
{
  "cartItems": [
    {"id": 123, "quantity": 1, "total": 5.99},
    {"id": 456, "quantity": 1, "total": 2.99},
    {"id": 789, "quantity": 1, "total": 1.99}
  ]
}
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Big Meal Deal",
    "discount": 2.50,
    "discountAmount": 2.50
  }
]
```

### 6. Weighted Items

#### `GET /api/weighted-items`
**List all weighted items**

**Response:**
```json
[
  {
    "id": 1,
    "menu_item_id": 789,
    "unit_weight": 100,
    "min_weight": 250,
    "max_weight": 5000,
    "weight_unit": "gram",
    "is_active": true
  }
]
```

#### `POST /api/weighted-items`
**Create weighted item**

**Request:**
```json
{
  "menu_item_id": 789,
  "unit_weight": 100,
  "min_weight": 250,
  "max_weight": 5000,
  "weight_unit": "gram"
}
```

#### `POST /api/weighted-items/:id/tiers`
**Add pricing tier**

**Request:**
```json
{
  "min_weight": 250,
  "max_weight": 500,
  "price": 8.99,
  "display_order": 1
}
```

#### `POST /api/cart/add-weighted-item`
**Add weighted item to cart**

**Request:**
```json
{
  "menu_item_id": 789,
  "weight": 500,
  "quantity": 1
}
```

**Response:**
```json
{
  "success": true,
  "cartItem": {
    "id": 123,
    "menu_item_id": 789,
    "weight": 500,
    "weight_unit": "gram",
    "price": 8.99,
    "total": 8.99
  }
}
```

### 7. Offline Mode & Sync

#### `GET /api/sync/status`
**Get sync status**

**Response:**
```json
{
  "is_online": true,
  "pending_operations": 0,
  "last_sync": "2026-01-20T10:00:00Z",
  "device_id": "device-abc123"
}
```

#### `POST /api/offline/orders`
**Create order in offline mode**

**Request:**
```json
{
  "items": [
    {"menu_item_id": 123, "quantity": 2, "price": 5.99}
  ],
  "customer_id": 456,
  "table_id": 1
}
```

#### `GET /api/sync/queue`
**Get sync queue status**

**Response:**
```json
[
  {
    "id": 1,
    "operation_type": "create_order",
    "entity_type": "orders",
    "entity_id": 123,
    "status": "pending",
    "created_at": "2026-01-20T10:00:00Z"
  }
]
```

### 8. Split Billing

#### `POST /api/orders/:id/split`
**Create split bill session**

**Request:**
```json
{
  "total_splits": 3,
  "split_method": "by_items",
  "notes": "Family of 3"
}
```

#### `POST /api/split-bills/:id/split-by-items`
**Split by items**

**Request:**
```json
{
  "item_assignments": [
    {"item_id": 789, "split_number": 1},
    {"item_id": 101, "split_number": 2},
    {"item_id": 102, "split_number": 3}
  ]
}
```

#### `POST /api/split-bills/:id/payments`
**Add payment to split**

**Request:**
```json
{
  "split_number": 1,
  "amount": 15.50,
  "payment_method": "card",
  "transaction_id": "TXN12345"
}
```

### 9. Void & Refund Workflow

#### `GET /api/void-refund/reasons`
**List void/refund reasons**

**Response:**
```json
[
  {
    "id": 1,
    "reason_code": "TYP",
    "reason_description": "Typographical Error",
    "is_active": true
  }
]
```

#### `POST /api/void-refund/requests`
**Create void/refund request**

**Request:**
```json
{
  "order_id": 123,
  "item_id": 456,
  "request_type": "VOID",
  "reason_code": "TYP",
  "reason_details": "Wrong item ordered",
  "requested_by": 7,
  "amount": 8.99,
  "quantity": 1,
  "is_partial": false,
  "notes": "Customer requested void"
}
```

#### `POST /api/void-refund/requests/:id/approve`
**Approve void/refund request**

**Request:**
```json
{
  "approved_by": 1,
  "comments": "Approved - typographical error"
}
```

### 10. Cash Drawer Reconciliation

#### `GET /api/cash-drawers`
**List all cash drawers**

**Response:**
```json
[
  {
    "id": 1,
    "name": "Main Cash Drawer",
    "location": "Counter 1",
    "is_active": true
  }
]
```

#### `POST /api/cash-drawers/:id/open`
**Open cash drawer**

**Request:**
```json
{
  "opening_balance": 500.00,
  "opened_by": 1,
  "notes": "Start of business day"
}
```

#### `POST /api/cash-drawers/sessions/:id/transactions`
**Record cash transaction**

**Request:**
```json
{
  "transaction_type": "payment",
  "amount": 25.50,
  "reference_id": 789,
  "reference_type": "order",
  "description": "Order #123 payment"
}
```

#### `POST /api/cash-drawers/sessions/:id/reconcile`
**Reconcile cash drawer**

**Request:**
```json
{
  "actual_count": 623.75,
  "reconciled_by": 1,
  "difference_reason": "Rounding difference",
  "notes": "End of shift reconciliation"
}
```

### 11. Recipe & BOM Tracking

#### `GET /api/recipes`
**List all recipes**

**Response:**
```json
[
  {
    "id": 1,
    "menu_item_id": 789,
    "name": "Cheeseburger",
    "description": "Classic cheeseburger recipe",
    "is_active": true
  }
]
```

#### `POST /api/recipes`
**Create recipe**

**Request:**
```json
{
  "menu_item_id": 789,
  "name": "Cheeseburger",
  "description": "Classic cheeseburger recipe"
}
```

#### `POST /api/recipes/:id/ingredients`
**Add ingredient to recipe**

**Request:**
```json
{
  "menu_item_id": 101,
  "quantity": 1,
  "unit": "piece",
  "is_required": true,
  "display_order": 1
}
```

#### `GET /api/recipes/:id/cost`
**Calculate recipe cost**

**Response:**
```json
{
  "recipe_id": 1,
  "cost": 2.45,
  "ingredients": [
    {
      "name": "Bun",
      "quantity": 1,
      "unit": "piece",
      "cost": 0.50
    }
  ]
}
```

### 12. Enhanced Tax Engine

#### `GET /api/tax/rates`
**List all tax rates**

**Response:**
```json
[
  {
    "id": 1,
    "name": "GST 18%",
    "rate": 0.18,
    "tax_type": "exclusive",
    "is_active": true,
    "location_id": 1
  }
]
```

#### `POST /api/tax/rates`
**Create tax rate**

**Request:**
```json
{
  "name": "GST 18%",
  "rate": 0.18,
  "tax_type": "exclusive",
  "is_active": true,
  "location_id": 1
}
```

#### `POST /api/tax/calculate`
**Calculate tax for items**

**Request:**
```json
{
  "items": [
    {"id": 123, "price": 10.00, "tax_type": "exclusive", "tax_rate_id": 1}
  ],
  "tax_type": "exclusive"
}
```

**Response:**
```json
{
  "subtotal": 10.00,
  "tax": 1.80,
  "total": 11.80,
  "tax_breakdown": [
    {
      "tax_rate_id": 1,
      "tax_name": "GST 18%",
      "amount": 1.80
    }
  ]
}
```

### 13. Loyalty Points System

#### `GET /api/loyalty/programs`
**List all loyalty programs**

**Response:**
```json
[
  {
    "id": 1,
    "name": "Cafe Rewards",
    "description": "Earn 1 point per dollar spent",
    "points_per_currency": 1.0,
    "is_active": true
  }
]
```

#### `POST /api/loyalty/programs`
**Create loyalty program**

**Request:**
```json
{
  "name": "Cafe Rewards",
  "description": "Earn 1 point per dollar spent",
  "points_per_currency": 1.0,
  "is_active": true,
  "min_purchase_amount": 1.0,
  "points_expiration_days": 365
}
```

#### `POST /api/loyalty/points/earn`
**Earn points**

**Request:**
```json
{
  "customer_id": 456,
  "order_id": 789,
  "amount": 25.50,
  "program_id": 1
}
```

**Response:**
```json
{
  "success": true,
  "points_earned": 25,
  "new_balance": 125,
  "transaction_id": 1
}
```

#### `POST /api/loyalty/points/redeem`
**Redeem points**

**Request:**
```json
{
  "customer_id": 456,
  "points": 100,
  "program_id": 1,
  "order_id": 789
}
```

**Response:**
```json
{
  "success": true,
  "points_redeemed": 100,
  "new_balance": 25,
  "discount_amount": 10.00,
  "transaction_id": 2
}
```

### 14. Online Order Integration

#### `GET /api/online-orders/providers`
**List all providers**

**Response:**
```json
[
  {
    "id": 1,
    "name": "food_delivery",
    "display_name": "FoodDelivery",
    "api_base_url": "https://api.fooddelivery.com/v1",
    "is_active": true
  }
]
```

#### `POST /api/online-orders/providers`
**Create provider**

**Request:**
```json
{
  "name": "food_delivery",
  "display_name": "FoodDelivery",
  "description": "Food delivery platform",
  "api_base_url": "https://api.fooddelivery.com/v1",
  "is_active": true
}
```

#### `POST /api/online-orders/providers/:id/credentials`
**Update provider credentials**

**Request:**
```json
{
  "api_key": "sk_live_abc123",
  "api_secret": "secret_456xyz",
  "webhook_secret": "whsec_789def"
}
```

#### `POST /api/online-orders/webhooks`
**Receive webhook**

**Headers:**
```
X-Signature: <signature>
X-Provider: food_delivery
```

**Request:**
```json
{
  "event_type": "order_created",
  "order_id": "FD12345",
  "customer": {
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com"
  },
  "items": [
    {
      "product_id": "pizza_pepperoni",
      "quantity": 1,
      "price": 12.99,
      "notes": "Extra cheese"
    }
  ],
  "total": 12.99,
  "delivery_address": "123 Main St",
  "expected_delivery_time": "2026-01-20T11:00:00Z"
}
```

#### `POST /api/online-orders/:id/accept`
**Accept online order**

**Request:**
```json
{
  "notes": "Order accepted and sent to kitchen"
}
```

### 15. Digital Receipts

#### `GET /api/digital-receipts/templates`
**List all templates**

**Response:**
```json
[
  {
    "id": 1,
    "name": "Standard Email Receipt",
    "description": "Standard email receipt template",
    "template_type": "email",
    "is_default": true,
    "is_active": true
  }
]
```

#### `POST /api/digital-receipts/templates`
**Create template**

**Request:**
```json
{
  "name": "Standard Email Receipt",
  "description": "Standard email receipt template",
  "template_type": "email",
  "subject_template": "Your receipt from {{business_name}} - Order #{{order_number}}",
  "body_template": "Thank you for your order!\n\nOrder: {{order_number}}\nTotal: ${{order_total}}",
  "html_template": "<h1>Your Receipt</h1><p>Thank you for your order!</p>",
  "is_default": true,
  "is_active": true
}
```

#### `POST /api/digital-receipts/orders/:id/send`
**Send digital receipt**

**Request:**
```json
{
  "receipt_type": "email",
  "customer_id": 456,
  "template_id": 1
}
```

#### `POST /api/digital-receipts/preferences`
**Update customer preferences**

**Request:**
```json
{
  "customer_id": 456,
  "email": "customer@example.com",
  "phone": "+1234567890",
  "whatsapp_enabled": true,
  "email_enabled": true,
  "sms_enabled": false,
  "preferred_language": "en"
}
```

### 16. Hardware Drivers

#### `GET /api/hardware/devices`
**List all hardware devices**

**Response:**
```json
[
  {
    "id": 1,
    "device_type": "escpos_printer",
    "device_name": "Kitchen Printer 1",
    "device_identifier": "USB001",
    "connection_type": "usb",
    "status": "connected",
    "is_active": true
  }
]
```

#### `POST /api/hardware/devices`
**Register hardware device**

**Request:**
```json
{
  "device_type": "escpos_printer",
  "device_name": "Kitchen Printer 1",
  "device_identifier": "USB001",
  "connection_type": "usb",
  "connection_string": "/dev/usb/lp0",
  "device_model": "Epson TM-T20",
  "manufacturer": "Epson",
  "paper_size": "80mm",
  "character_set": "UTF-8"
}
```

#### `POST /api/hardware/print/receipt`
**Print receipt**

**Request:**
```json
{
  "device_id": 1,
  "receipt_data": {
    "business_name": "Cafe POS",
    "order_number": "12345",
    "items": [
      {"name": "Coffee", "price": 3.50, "quantity": 2}
    ],
    "total": 7.00
  }
}
```

#### `POST /api/hardware/cfd/content`
**Set CFD content**

**Request:**
```json
{
  "device_id": 2,
  "content_type": "order_info",
  "content_data": {
    "order_number": "12345",
    "items": [
      {"name": "Cheeseburger", "status": "in-progress"}
    ],
    "total": 8.99
  }
}
```

## WebSocket API

### KDS WebSocket

**Connection:** `ws://localhost:3000/kds`

**Events:**

#### `station:created`
```json
{
  "station": {
    "station_id": 1,
    "name": "grill",
    "display_name": "Grill Station"
  }
}
```

#### `station:updated`
```json
{
  "station": {
    "station_id": 1,
    "name": "grill",
    "display_name": "Grill Station Updated"
  }
}
```

#### `station:deleted`
```json
{
  "stationId": 1
}
```

#### `order:created`
```json
{
  "order": {
    "kds_order_id": 1,
    "order_id": 123,
    "status": "received",
    "items": [
      {
        "kds_item_id": 1,
        "product_name": "Cheeseburger",
        "quantity": 2,
        "status": "received",
        "station_id": 1
      }
    ]
  }
}
```

#### `order:status-updated`
```json
{
  "kdsOrderId": 1,
  "oldStatus": "received",
  "newStatus": "in-progress",
  "order": {
    "kds_order_id": 1,
    "status": "in-progress"
  }
}
```

#### `item:status-updated`
```json
{
  "kdsItemId": 1,
  "oldStatus": "received",
  "newStatus": "in-progress",
  "item": {
    "kds_item_id": 1,
    "status": "in-progress"
  }
}
```

#### `order:bumped`
```json
{
  "order": {
    "kds_order_id": 1,
    "status": "bumped"
  }
}
```

#### `order:reopened`
```json
{
  "order": {
    "kds_order_id": 1,
    "status": "received"
  }
}
```

## Rate Limiting

API endpoints are rate limited to prevent abuse:
- 100 requests per minute per IP address
- 1000 requests per hour per IP address

## CORS

The API supports CORS with the following headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## Versioning

The API follows semantic versioning (v1, v2, etc.).

## Support

For API-related issues, refer to the individual feature documentation or contact support.
