// UI utilities and theme management for Cafe POS

const UI = {
  // Initialize theme
  initTheme: () => {
    const savedTheme = Utils.storage.get('theme', 'light');
    UI.setTheme(savedTheme);
  },
  
  // Set theme
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    Utils.storage.set('theme', theme);
    
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
    }
  },
  
  // Toggle theme
  toggleTheme: () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    UI.setTheme(newTheme);
  },
  
  // Update time display
  updateTime: () => {
    const timeEl = document.getElementById('current-time');
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = now.toLocaleString('default', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  },
  
  // Setup modal close buttons
  setupModals: () => {
    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        document.getElementById(modalId)?.classList.remove('active');
      });
    });
    
    // Close modal on background click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
          modal.classList.remove('active');
        });
      }
    });
  },
  
  // Setup PIN input handling
  setupPinInputs: () => {
    document.querySelectorAll('.pin-digit').forEach((input, index, inputs) => {
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        
        // Only allow numbers
        if (!/^\d*$/.test(value)) {
          e.target.value = '';
          return;
        }
        
        // Move to next input
        if (value && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      });
      
      input.addEventListener('keydown', (e) => {
        // Handle backspace
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          inputs[index - 1].focus();
        }
        
        // Handle Enter key
        if (e.key === 'Enter') {
          const form = e.target.closest('form');
          if (form) {
            form.dispatchEvent(new Event('submit'));
          }
        }
      });
      
      // Select all on focus
      input.addEventListener('focus', () => {
        input.select();
      });
    });
  },
  
  // Setup menu management modal
  setupMenuManagement: () => {
    const menuBtn = document.getElementById('menu-manage-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        MenuManagement.open();
      });
    }
    
    // Category form
    const categoryForm = document.getElementById('category-form');
    if (categoryForm) {
      categoryForm.addEventListener('submit', MenuManagement.saveCategory);
    }
    
    // Item form
    const itemForm = document.getElementById('item-form');
    if (itemForm) {
      itemForm.addEventListener('submit', MenuManagement.saveItem);
    }
    
    // Add category button
    const addCategoryBtn = document.getElementById('add-category-btn');
    if (addCategoryBtn) {
      addCategoryBtn.addEventListener('click', () => {
        MenuManagement.addCategory();
      });
    }
    
    // Add item button
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) {
      addItemBtn.addEventListener('click', () => {
        MenuManagement.addItem();
      });
    }
    
    // Menu tabs
    document.querySelectorAll('.menu-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        MenuManagement.switchTab(tab.dataset.tab);
      });
    });
  },
  
  // Setup theme toggle
  setupThemeToggle: () => {
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', UI.toggleTheme);
    }
  },
  
  // Setup print bill button
  setupPrintBill: () => {
    const printBtn = document.getElementById('print-bill-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        const billPreview = document.getElementById('bill-preview');
        if (billPreview) {
          const printWindow = window.open('', '_blank');
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Print Bill</title>
                <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body { font-family: 'Courier New', monospace; padding: 20px; font-size: 14px; }
                </style>
              </head>
              <body>${billPreview.innerHTML}</body>
            </html>
          `);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 250);
        }
      });
    }
  },
  
  // Initialize all UI components
  init: () => {
    UI.initTheme();
    UI.setupModals();
    UI.setupPinInputs();
    UI.setupMenuManagement();
    UI.setupThemeToggle();
    UI.setupPrintBill();
    
    // Start time update interval
    UI.updateTime();
    setInterval(UI.updateTime, 1000);
  }
};

// Export UI module
window.UI = UI;
