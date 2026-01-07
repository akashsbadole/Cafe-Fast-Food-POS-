const translations = {
  en: {
    // Auth
    "login_title": "COFFEE CAFE",
    "login_tagline": "Point of Sale System",
    "enter_pin": "Enter PIN",
    "login_btn": "Login",
    "login_hint": "Use PIN: 1234",
    "screen_locked": "Screen Locked",
    "enter_pin_continue": "Enter PIN to continue",
    "unlock_btn": "Unlock",
    
    // Header
    "kitchen_view": "Kitchen View",
    "order_history": "Order History",
    "manage_menu": "Manage Menu",
    "seed_data": "Seed Sample Data",
    "logout_confirm": "Are you sure you want to logout?",
    
    // Main UI
    "search_placeholder": "🔍 Search menu items (F2)",
    "no_items_found": "No items found",
    "current_order": "🛒 Current Order",
    "clear_cart": "Clear",
    "clear_cart_confirm": "Are you sure you want to clear the cart?",
    "cart_empty": "Cart is empty",
    "cart_hint": "Add items from the menu",
    "order_notes": "Order Notes",
    "order_notes_placeholder": "e.g., No sugar, extra cheese...",
    
    // Billing
    "subtotal": "Subtotal",
    "discount": "Discount",
    "tax": "Tax",
    "total": "Total",
    "pay_cash": "💵 Cash",
    "pay_upi": "📱 UPI",
    "pay_card": "💳 Card",
    "send_to_kitchen": "📤 Send to Kitchen",
    "checkout_print": "💰 Checkout & Print",
    "checkout_success": "Order placed successfully!",
    "checkout_fail": "Checkout failed. Please try again.",
    
    // Modals
    "kitchen_tickets": "👨‍🍳 Kitchen Order Tickets",
    "no_active_kot": "No active kitchen orders",
    "start_preparing": "Start Preparing",
    "mark_ready": "Mark Ready",
    "served": "Served",
    
    "order_details": "📋 Order Details",
    "reprint_bill": "🖨️ Reprint Bill",
    "close": "Close",
    
    "menu_management": "⚙️ Menu Management",
    "add_category": "+ Add Category",
    "add_item": "+ Add Menu Item",
    "categories": "Categories",
    "menu_items": "Menu Items",
    "taxes": "Taxes",
    
    // Taxonomy
    "available": "Available",
    "unavailable": "Unavailable",
    "edit": "Edit",
    "delete": "Delete",
    "save": "Save",
    "cancel": "Cancel",
    "name": "Name",
    "price": "Price",
    "description": "Description",
    "status": "Status",
    "actions": "Actions"
  },
  hi: {
    // Auth
    "login_title": "कॉफी कैफे",
    "login_tagline": "बिक्री केंद्र प्रणाली",
    "enter_pin": "पिन दर्ज करें",
    "login_btn": "लॉग इन",
    "login_hint": "पिन का उपयोग करें: 1234",
    "screen_locked": "स्क्रीन लॉक है",
    "enter_pin_continue": "जारी रखने के लिए पिन दर्ज करें",
    "unlock_btn": "अनब्लॉक",
    
    // Header
    "kitchen_view": "रसोई दृश्य",
    "order_history": "ऑर्डर इतिहास",
    "manage_menu": "मेनू प्रबंधित करें",
    "seed_data": "नमूना डेटा",
    "logout_confirm": "क्या आप लॉग आउट करना चाहते हैं?",
    
    // Main UI
    "search_placeholder": "🔍 मेनू आइटम खोजें (F2)",
    "no_items_found": "कोई आइटम नहीं मिला",
    "current_order": "🛒 वर्तमान ऑर्डर",
    "clear_cart": "साफ़ करें",
    "clear_cart_confirm": "क्या आप कार्ट साफ़ करना चाहते हैं?",
    "cart_empty": "कार्ट खाली है",
    "cart_hint": "मेनू से आइटम जोड़ें",
    "order_notes": "ऑर्डर नोट्स",
    "order_notes_placeholder": "उदा. चीनी नहीं...",
    
    // Billing
    "subtotal": "उपटोटल",
    "discount": "छूट",
    "tax": "कर",
    "total": "कुल",
    "pay_cash": "💵 नकद",
    "pay_upi": "📱 यूपीआई",
    "pay_card": "💳 कार्ड",
    "send_to_kitchen": "📤 रसोई में भेजें",
    "checkout_print": "💰 चेकआउट और प्रिंट",
    "checkout_success": "ऑर्डर सफलतापूर्वक दिया गया!",
    "checkout_fail": "चेकआउट विफल। कृपया पुनः प्रयास करें।",
    
    // Modals
    "kitchen_tickets": "👨‍🍳 रसोई ऑर्डर टिकट",
    "no_active_kot": "कोई सक्रिय रसोई ऑर्डर नहीं",
    "start_preparing": "तैयारी शुरू करें",
    "mark_ready": "तैयार चिह्नित करें",
    "served": "परोसा गया",
    
    "order_details": "📋 ऑर्डर विवरण",
    "reprint_bill": "🖨️ बिल दोबारा प्रिंट करें",
    "close": "बंद करें",
    
    "menu_management": "⚙️ मेनू प्रबंधन",
    "add_category": "+ श्रेणी जोड़ें",
    "add_item": "+ मेनू आइटम जोड़ें",
    "categories": "श्रेणियाँ",
    "menu_items": "मेनू आइटम",
    "taxes": "कर",
    
    // Taxonomy
    "available": "उपलब्ध",
    "unavailable": "अनुपलब्ध",
    "edit": "संपादित करें",
    "delete": "हटाएं",
    "save": "सहेजें",
    "cancel": "रद्द करें",
    "name": "नाम",
    "price": "कीमत",
    "description": "विवरण",
    "status": "स्थिति",
    "actions": "क्रियाएं"
  }
};

const i18n = {
  lang: localStorage.getItem('lang') || 'en',
  
  t(key) {
    return translations[this.lang][key] || key;
  },
  
  setLang(lang) {
    this.lang = lang;
    localStorage.setItem('lang', lang);
    // Dispatch event to update Alpine components if needed, or rely on reactivity
    window.dispatchEvent(new CustomEvent('lang-change', { detail: { lang } }));
  }
};
