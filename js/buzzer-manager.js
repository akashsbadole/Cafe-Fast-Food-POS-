// Buzzer Management Module for Cafe POS

const BuzzerManager = {
  // Get all buzzers
  getAll: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers');
      if (!response.ok) {
        throw new Error('Failed to fetch buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching buzzers:', error);
      return [];
    }
  },
  
  // Get buzzer by ID
  getById: async (buzzerId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch buzzer');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching buzzer:', error);
      return null;
    }
  },
  
  // Get available buzzers
  getAvailable: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/available');
      if (!response.ok) {
        throw new Error('Failed to fetch available buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching available buzzers:', error);
      return [];
    }
  },
  
  // Create new buzzer
  create: async (buzzerData) => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buzzerData),
      });
      if (!response.ok) {
        throw new Error('Failed to create buzzer');
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating buzzer:', error);
      return null;
    }
  },
  
  // Create multiple buzzers (batch creation)
  createMultiple: async (count, startNumber = 1) => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ count, startNumber }),
      });
      if (!response.ok) {
        throw new Error('Failed to create buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating buzzers:', error);
      return [];
    }
  },
  
  // Update buzzer
  update: async (buzzerId, buzzerData) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buzzerData),
      });
      if (!response.ok) {
        throw new Error('Failed to update buzzer');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating buzzer:', error);
      return null;
    }
  },
  
  // Delete buzzer
  delete: async (buzzerId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete buzzer');
      }
      return true;
    } catch (error) {
      console.error('Error deleting buzzer:', error);
      return false;
    }
  },
  
  // Assign buzzer to order
  assignToOrder: async (orderId, buzzerId) => {
    try {
      const response = await fetch('http://localhost:3000/api/orders/assign-buzzer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, buzzerId }),
      });
      if (!response.ok) {
        throw new Error('Failed to assign buzzer to order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error assigning buzzer to order:', error);
      return null;
    }
  },
  
  // Get buzzers by order ID
  getByOrderId: async (orderId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/orders/${orderId}/buzzers`);
      if (!response.ok) {
        throw new Error('Failed to fetch buzzers for order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching buzzers for order:', error);
      return [];
    }
  },
  
  // Update buzzer status
  updateStatus: async (buzzerId, status) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error('Failed to update buzzer status');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating buzzer status:', error);
      return null;
    }
  },
  
  // Generate next available buzzer number
  generateNextNumber: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/next-number');
      if (!response.ok) {
        throw new Error('Failed to generate next buzzer number');
      }
      return await response.json();
    } catch (error) {
      console.error('Error generating next buzzer number:', error);
      return null;
    }
  },
  
  // Reset all buzzers to available status
  resetAll: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/reset', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error resetting buzzers:', error);
      return false;
    }
  },
};

// Export buzzer manager module
if (typeof window !== 'undefined') {
  window.BuzzerManager = BuzzerManager;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BuzzerManager;
}