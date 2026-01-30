// Inventory Validation Module
// This file contains validation schemas and functions for inventory management

const Joi = require('joi');

// Inventory Item Validation Schema
const inventoryItemSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'Item name is required',
    'string.min': 'Item name must be at least 2 characters long',
    'string.max': 'Item name cannot exceed 100 characters'
  }),
  category_id: Joi.number().integer().positive().required().messages({
    'number.base': 'Category ID must be a number',
    'number.integer': 'Category ID must be an integer',
    'number.positive': 'Category ID must be positive',
    'any.required': 'Category ID is required'
  }),
  stock_quantity: Joi.number().integer().min(0).default(0).messages({
    'number.base': 'Stock quantity must be a number',
    'number.integer': 'Stock quantity must be an integer',
    'number.min': 'Stock quantity cannot be negative'
  }),
  low_stock_threshold: Joi.number().integer().min(0).default(5).messages({
    'number.base': 'Low stock threshold must be a number',
    'number.integer': 'Low stock threshold must be an integer',
    'number.min': 'Low stock threshold cannot be negative'
  }),
  cost_price: Joi.number().precision(2).min(0).default(0).messages({
    'number.base': 'Cost price must be a number',
    'number.min': 'Cost price cannot be negative',
    'number.precision': 'Cost price cannot have more than 2 decimal places'
  }),
  selling_price: Joi.number().precision(2).min(0).default(0).messages({
    'number.base': 'Selling price must be a number',
    'number.min': 'Selling price cannot be negative',
    'number.precision': 'Selling price cannot have more than 2 decimal places'
  }),
  unit: Joi.string().valid('piece', 'kg', 'g', 'ml', 'l', 'pack', 'box').default('piece').messages({
    'any.only': 'Unit must be one of: piece, kg, g, ml, l, pack, box'
  }),
  supplier_id: Joi.number().integer().positive().allow(null).optional().messages({
    'number.base': 'Supplier ID must be a number',
    'number.integer': 'Supplier ID must be an integer',
    'number.positive': 'Supplier ID must be positive'
  }),
  description: Joi.string().max(500).allow('').optional().messages({
    'string.max': 'Description cannot exceed 500 characters'
  })
});

// Stock Adjustment Validation Schema
const stockAdjustmentSchema = Joi.object({
  type: Joi.string().valid('add', 'remove', 'set').required().messages({
    'any.only': 'Adjustment type must be one of: add, remove, set',
    'any.required': 'Adjustment type is required'
  }),
  quantity: Joi.number().integer().positive().required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.positive': 'Quantity must be positive',
    'any.required': 'Quantity is required'
  }),
  reason: Joi.string().min(5).max(200).required().messages({
    'string.empty': 'Reason is required',
    'string.min': 'Reason must be at least 5 characters long',
    'string.max': 'Reason cannot exceed 200 characters'
  })
});

// Category Validation Schema
const categorySchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.empty': 'Category name is required',
    'string.min': 'Category name must be at least 2 characters long',
    'string.max': 'Category name cannot exceed 50 characters'
  }),
  description: Joi.string().max(200).allow('').optional().messages({
    'string.max': 'Description cannot exceed 200 characters'
  })
});

// Supplier Validation Schema
const supplierSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'Supplier name is required',
    'string.min': 'Supplier name must be at least 2 characters long',
    'string.max': 'Supplier name cannot exceed 100 characters'
  }),
  contact_person: Joi.string().max(100).allow('').optional().messages({
    'string.max': 'Contact person name cannot exceed 100 characters'
  }),
  phone: Joi.string().pattern(/^[0-9+\-\s()]{7,15}$/).allow('').optional().messages({
    'string.pattern.base': 'Phone number format is invalid'
  }),
  email: Joi.string().email().allow('').optional().messages({
    'string.email': 'Email format is invalid'
  }),
  address: Joi.string().max(500).allow('').optional().messages({
    'string.max': 'Address cannot exceed 500 characters'
  }),
  notes: Joi.string().max(500).allow('').optional().messages({
    'string.max': 'Notes cannot exceed 500 characters'
  })
});

// Export validation functions
function validateInventoryItem(data) {
  return inventoryItemSchema.validate(data, { abortEarly: false });
}

function validateStockAdjustment(data) {
  return stockAdjustmentSchema.validate(data, { abortEarly: false });
}

function validateCategory(data) {
  return categorySchema.validate(data, { abortEarly: false });
}

function validateSupplier(data) {
  return supplierSchema.validate(data, { abortEarly: false });
}

module.exports = {
  validateInventoryItem,
  validateStockAdjustment,
  validateCategory,
  validateSupplier
};
