// Table Management Module for Cafe POS

const TableManager = {
  // Get all tables
  getAll: async (locationId = 1) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables?location_id=${locationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tables');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching tables:', error);
      return [];
    }
  },
  
  // Get table by ID
  getById: async (tableId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch table');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching table:', error);
      return null;
    }
  },
  
  // Get available tables
  getAvailable: async (locationId = 1) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/available?location_id=${locationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch available tables');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching available tables:', error);
      return [];
    }
  },
  
  // Create new table
  create: async (tableData) => {
    try {
      const response = await fetch('http://localhost:3000/api/tables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tableData),
      });
      if (!response.ok) {
        throw new Error('Failed to create table');
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating table:', error);
      return null;
    }
  },
  
  // Update table
  update: async (tableId, tableData) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tableData),
      });
      if (!response.ok) {
        throw new Error('Failed to update table');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating table:', error);
      return null;
    }
  },
  
  // Delete table
  delete: async (tableId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete table');
      }
      return true;
    } catch (error) {
      console.error('Error deleting table:', error);
      return false;
    }
  },
  
  // Assign table to order
  assignToOrder: async (orderId, tableId) => {
    try {
      const response = await fetch('http://localhost:3000/api/orders/assign-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, tableId }),
      });
      if (!response.ok) {
        throw new Error('Failed to assign table to order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error assigning table to order:', error);
      return null;
    }
  },
  
  // Transfer order to different table
  transferOrder: async (orderId, newTableId) => {
    try {
      const response = await fetch('http://localhost:3000/api/orders/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, newTableId }),
      });
      if (!response.ok) {
        throw new Error('Failed to transfer order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error transferring order:', error);
      return null;
    }
  },
  
  // Get tables by order ID
  getByOrderId: async (orderId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/orders/${orderId}/tables`);
      if (!response.ok) {
        throw new Error('Failed to fetch tables for order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching tables for order:', error);
      return [];
    }
  },
  
  // Get table layouts
  getLayouts: async (locationId = 1) => {
    try {
      const response = await fetch(`http://localhost:3000/api/table-layouts?location_id=${locationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch table layouts');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching table layouts:', error);
      return [];
    }
  },
  
  // Get table positions for a layout
  getLayoutPositions: async (layoutId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/table-layouts/${layoutId}/positions`);
      if (!response.ok) {
        throw new Error('Failed to fetch table positions');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching table positions:', error);
      return [];
    }
  },
  
  // Update table status
  updateStatus: async (tableId, status) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error('Failed to update table status');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating table status:', error);
      return null;
    }
  },
};

// Export table manager module
if (typeof window !== 'undefined') {
  window.TableManager = TableManager;
}

module.exports = TableManager;