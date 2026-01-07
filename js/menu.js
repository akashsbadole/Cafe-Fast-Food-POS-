// Menu management module for Cafe POS

const Menu = {
  categories: [],
  items: [],
  currentCategory: 'all',
  searchQuery: '',
  
  // Initialize menu data
  init: () => {
    Menu.loadCategories();
    Menu.loadItems();
    Menu.renderCategories();
    Menu.renderItems();
    Menu.setupEventListeners();
  },
  
  // Load categories from database
  loadCategories: () => {
    Menu.categories = category.getAll();
  },
  
  // Load menu items from database
  loadItems: () => {
    Menu.items = menu.getAll();
  },
  
  // Render category tabs
  renderCategories: () => {
    const container = document.getElementById('category-tabs');
    if (!container) return;
    
    let html = '<button class="category-tab active" data-category="all">All</button>';
    
    Menu.categories.forEach(cat => {
      html += `<button class="category-tab" data-category="${cat.id}">${cat.icon} ${cat.name}</button>`;
    });
    
    container.innerHTML = html;
  },
  
  // Render menu items
  renderItems: () => {
    const container = document.getElementById('menu-grid');
    if (!container) return;
    
    let filteredItems = Menu.items;
    
    // Filter by category
    if (Menu.currentCategory !== 'all') {
      filteredItems = filteredItems.filter(item => item.category_id === parseInt(Menu.currentCategory));
    }
    
    // Filter by search
    if (Menu.searchQuery) {
      const query = Menu.searchQuery.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }
    
    // Only show available items
    filteredItems = filteredItems.filter(item => item.is_available === 1);
    
    if (filteredItems.length === 0) {
      container.innerHTML = `
        <div class="empty-menu">
          <span>🔍</span>
          <p>No items found</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    filteredItems.forEach(item => {
      const icon = item.category_icon || '🍽️';
      html += `
        <div class="menu-item ${item.is_available ? '' : 'unavailable'}" 
             data-id="${item.id}" 
             data-name="${item.name}"
             data-price="${item.price}">
          <div class="menu-item-icon">${icon}</div>
          <div class="menu-item-name">${item.name}</div>
          <div class="menu-item-price">${Utils.formatCurrency(item.price)}</div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  },
  
  // Setup event listeners
  setupEventListeners: () => {
    // Category tabs
    const categoryContainer = document.getElementById('category-tabs');
    if (categoryContainer) {
      categoryContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-tab')) {
          document.querySelectorAll('.category-tab').forEach(tab => tab.classList.remove('active'));
          e.target.classList.add('active');
          Menu.currentCategory = e.target.dataset.category;
          Menu.renderItems();
        }
      });
    }
    
    // Search
    const searchInput = document.getElementById('menu-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        Menu.searchQuery = e.target.value;
        Menu.renderItems();
      });
    }
    
    // Menu item click
    const menuGrid = document.getElementById('menu-grid');
    if (menuGrid) {
      menuGrid.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.menu-item');
        if (menuItem && !menuItem.classList.contains('unavailable')) {
          const itemId = parseInt(menuItem.dataset.id);
          const itemName = menuItem.dataset.name;
          const itemPrice = parseFloat(menuItem.dataset.price);
          
          Cart.addItem(itemId, itemName, itemPrice);
        }
      });
    }
  },
  
  // Get category by ID
  getCategoryById: (id) => {
    return Menu.categories.find(cat => cat.id === id);
  },
  
  // Get item by ID
  getItemById: (id) => {
    return Menu.items.find(item => item.id === id);
  },
  
  // Refresh menu data
  refresh: () => {
    Menu.loadCategories();
    Menu.loadItems();
    Menu.renderCategories();
    Menu.renderItems();
  }
};

// Menu management modal functions
const MenuManagement = {
  currentTab: 'categories',
  
  // Open menu management modal
  open: () => {
    document.getElementById('menu-modal').classList.add('active');
    MenuManagement.renderContent();
  },
  
  // Close menu management modal
  close: () => {
    document.getElementById('menu-modal').classList.remove('active');
  },
  
  // Render content based on current tab
  renderContent: () => {
    const container = document.getElementById('menu-content');
    if (!container) return;
    
    if (MenuManagement.currentTab === 'categories') {
      MenuManagement.renderCategoriesTable(container);
    } else {
      MenuManagement.renderItemsTable(container);
    }
  },
  
  // Render categories table
  renderCategoriesTable: (container) => {
    const categories = category.getAll();
    
    let html = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Icon</th>
            <th>Name</th>
            <th>Order</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    categories.forEach(cat => {
      html += `
        <tr>
          <td>${cat.id}</td>
          <td>${cat.icon}</td>
          <td>${cat.name}</td>
          <td>${cat.display_order}</td>
          <td class="menu-actions">
            <button class="btn btn-small btn-secondary" onclick="MenuManagement.editCategory(${cat.id})">Edit</button>
            <button class="btn btn-small btn-danger" onclick="MenuManagement.deleteCategory(${cat.id})">Delete</button>
          </td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
  },
  
  // Render items table
  renderItemsTable: (container) => {
    const items = menu.getAll();
    
    let html = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    items.forEach(item => {
      const statusClass = item.is_available ? 'available' : 'unavailable';
      const statusText = item.is_available ? 'Available' : 'Unavailable';
      
      html += `
        <tr>
          <td>${item.id}</td>
          <td>${item.name}</td>
          <td>${item.category_name}</td>
          <td>${Utils.formatCurrency(item.price)}</td>
          <td>
            <button class="status-toggle ${statusClass}" onclick="MenuManagement.toggleItem(${item.id})">
              ${statusText}
            </button>
          </td>
          <td class="menu-actions">
            <button class="btn btn-small btn-secondary" onclick="MenuManagement.editItem(${item.id})">Edit</button>
            <button class="btn btn-small btn-danger" onclick="MenuManagement.deleteItem(${item.id})">Delete</button>
          </td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
  },
  
  // Add new category
  addCategory: () => {
    document.getElementById('category-form-title').textContent = 'Add Category';
    document.getElementById('category-id').value = '';
    document.getElementById('category-name').value = '';
    document.getElementById('category-order').value = '0';
    document.getElementById('category-icon').value = '';
    document.getElementById('category-form-modal').classList.add('active');
  },
  
  // Edit category
  editCategory: (id) => {
    const cat = category.getById(id);
    if (!cat) return;
    
    document.getElementById('category-form-title').textContent = 'Edit Category';
    document.getElementById('category-id').value = cat.id;
    document.getElementById('category-name').value = cat.name;
    document.getElementById('category-order').value = cat.display_order;
    document.getElementById('category-icon').value = cat.icon;
    document.getElementById('category-form-modal').classList.add('active');
  },
  
  // Delete category
  deleteCategory: (id) => {
    if (confirm('Are you sure you want to delete this category?')) {
      category.delete(id);
      Menu.refresh();
      MenuManagement.renderContent();
    }
  },
  
  // Save category
  saveCategory: (e) => {
    e.preventDefault();
    
    const id = document.getElementById('category-id').value;
    const name = document.getElementById('category-name').value.trim();
    const order = parseInt(document.getElementById('category-order').value) || 0;
    const icon = document.getElementById('category-icon').value.trim() || '☕';
    
    if (!name) {
      alert('Please enter a category name');
      return;
    }
    
    if (id) {
      category.update(parseInt(id), name, icon, order);
    } else {
      category.create(name, icon, order);
    }
    
    document.getElementById('category-form-modal').classList.remove('active');
    Menu.refresh();
    MenuManagement.renderContent();
  },
  
  // Add new item
  addItem: () => {
    // Populate category dropdown
    const select = document.getElementById('item-category');
    select.innerHTML = '';
    Menu.categories.forEach(cat => {
      select.innerHTML += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
    });
    
    document.getElementById('item-form-title').textContent = 'Add Menu Item';
    document.getElementById('item-id').value = '';
    document.getElementById('item-name').value = '';
    document.getElementById('item-category').value = Menu.categories[0]?.id || '';
    document.getElementById('item-price').value = '';
    document.getElementById('item-description').value = '';
    document.getElementById('item-available').checked = true;
    document.getElementById('item-form-modal').classList.add('active');
  },
  
  // Edit item
  editItem: (id) => {
    const item = menu.getById(id);
    if (!item) return;
    
    // Populate category dropdown
    const select = document.getElementById('item-category');
    select.innerHTML = '';
    Menu.categories.forEach(cat => {
      const selected = cat.id === item.category_id ? 'selected' : '';
      select.innerHTML += `<option value="${cat.id}" ${selected}>${cat.icon} ${cat.name}</option>`;
    });
    
    document.getElementById('item-form-title').textContent = 'Edit Menu Item';
    document.getElementById('item-id').value = item.id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-price').value = item.price;
    document.getElementById('item-description').value = item.description || '';
    document.getElementById('item-available').checked = item.is_available === 1;
    document.getElementById('item-form-modal').classList.add('active');
  },
  
  // Delete item
  deleteItem: (id) => {
    if (confirm('Are you sure you want to delete this item?')) {
      menu.delete(id);
      Menu.refresh();
      MenuManagement.renderContent();
    }
  },
  
  // Toggle item availability
  toggleItem: (id) => {
    menu.toggleAvailability(id);
    Menu.refresh();
    MenuManagement.renderContent();
  },
  
  // Save item
  saveItem: (e) => {
    e.preventDefault();
    
    const id = document.getElementById('item-id').value;
    const categoryId = parseInt(document.getElementById('item-category').value);
    const name = document.getElementById('item-name').value.trim();
    const price = parseFloat(document.getElementById('item-price').value);
    const description = document.getElementById('item-description').value.trim();
    const isAvailable = document.getElementById('item-available').checked;
    
    if (!name || !price) {
      alert('Please enter item name and price');
      return;
    }
    
    if (id) {
      menu.update(parseInt(id), categoryId, name, price, description, isAvailable);
    } else {
      menu.create(categoryId, name, price, description);
    }
    
    document.getElementById('item-form-modal').classList.remove('active');
    Menu.refresh();
    MenuManagement.renderContent();
  },
  
  // Switch tab
  switchTab: (tab) => {
    MenuManagement.currentTab = tab;
    document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.menu-tab[data-tab="${tab}"]`).classList.add('active');
    MenuManagement.renderContent();
  }
};

// Export menu module
window.Menu = Menu;
window.MenuManagement = MenuManagement;
