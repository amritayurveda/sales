// public/js/api.js

const API = {
  getToken() {
    return localStorage.getItem('sales_register_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('sales_register_token', token);
    } else {
      localStorage.removeItem('sales_register_token');
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401 || (response.status === 403 && endpoint.startsWith('/auth/'))) {
        this.setToken(null);
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        throw new Error(data.error || 'Session expired. Please log in again.');
      }

      if (!response.ok) {
        const error = new Error(data.error || `HTTP error ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  async login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async getMe() {
    return this.request('/auth/me');
  },

  async getDealersList() {
    return this.request('/auth/dealers-list');
  },

  // Products
  async getProducts() {
    return this.request('/products');
  },

  async addProduct(product) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
  },

  async updateProduct(id, updates) {
    return this.request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  async deleteProduct(id) {
    return this.request(`/products/${id}`, {
      method: 'DELETE'
    });
  },

  // DC Rules
  async getDCRules() {
    return this.request('/dc-rules');
  },

  async getDCRule(district) {
    return this.request(`/dc-rules/${encodeURIComponent(district)}`);
  },

  async calculateDC(district, price, productName) {
    return this.request('/dc-rules/calculate', {
      method: 'POST',
      body: JSON.stringify({ district, price, productName })
    });
  },

  async updateDCRule(district, ruleData) {
    return this.request(`/dc-rules/${encodeURIComponent(district)}`, {
      method: 'PUT',
      body: JSON.stringify(ruleData)
    });
  },

  // Sales
  async getSales(district, date) {
    return this.request(`/sales/${encodeURIComponent(district)}/${encodeURIComponent(date)}`);
  },

  async saveSales(district, date, entries) {
    return this.request(`/sales/${encodeURIComponent(district)}/${encodeURIComponent(date)}`, {
      method: 'POST',
      body: JSON.stringify({ entries })
    });
  },

  // Ledger
  async getLedger(district, date) {
    return this.request(`/ledger/${encodeURIComponent(district)}/${encodeURIComponent(date)}`);
  },

  async addLedgerEntry(district, date, entry) {
    return this.request(`/ledger/${encodeURIComponent(district)}/${encodeURIComponent(date)}`, {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  },

  async addAutoDC(district, date, price, productName) {
    return this.request(`/ledger/${encodeURIComponent(district)}/${encodeURIComponent(date)}/auto-dc`, {
      method: 'POST',
      body: JSON.stringify({ price, productName })
    });
  },

  async deleteLedgerEntry(district, date, id) {
    return this.request(`/ledger/${encodeURIComponent(district)}/${encodeURIComponent(date)}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // Admin Overview & Real-Time Live Feed
  async getAdminLiveFeed(date, since = 0) {
    const q = `?date=${encodeURIComponent(date)}&since=${encodeURIComponent(since)}`;
    return this.request(`/admin/live-feed${q}`);
  },

  async getAdminOverview(date) {
    return this.request(`/admin/overview?date=${encodeURIComponent(date)}`);
  },

  async getAdminUsers() {
    return this.request('/admin/users');
  },

  async resetDealerPassword(userId, newPassword) {
    return this.request('/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword })
    });
  },

  // Master Product & Scheme Catalog
  async getMasterProducts() {
    return this.request('/inventory/master-products');
  },

  async createMasterProduct(data) {
    return this.request('/inventory/master-product', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async renameMasterProduct(id, name) {
    return this.request(`/inventory/master-product/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    });
  },

  async manageMasterScheme(id, action, scheme) {
    return this.request(`/inventory/master-product/${encodeURIComponent(id)}/scheme`, {
      method: 'POST',
      body: JSON.stringify({ action, scheme })
    });
  },

  async deleteMasterProduct(id) {
    return this.request(`/inventory/master-product/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  async assignDistrictProductFromMaster(district, masterProductId, initialStock) {
    return this.request('/inventory/assign-district-product', {
      method: 'POST',
      body: JSON.stringify({ district, masterProductId, initialStock })
    });
  },

  // Day Stock & Excel Register
  async getDistrictDayStock(district, date) {
    return this.request(`/inventory/district-day-stock/${encodeURIComponent(district)}/${encodeURIComponent(date)}`);
  },

  async deleteDistrictProduct(district, productId) {
    return this.request(`/inventory/district/${encodeURIComponent(district)}/product/${encodeURIComponent(productId)}`, {
      method: 'DELETE'
    });
  },

  async updateMilaInward(district, date, productId, milaQty) {
    return this.request('/inventory/mila-inward', {
      method: 'POST',
      body: JSON.stringify({ district, date, productId, milaQty })
    });
  },

  async updateInwardNotes(district, date, note) {
    return this.request('/inventory/inward-notes', {
      method: 'POST',
      body: JSON.stringify({ district, date, note })
    });
  },

  async adjustBaseStock(district, productId, newStock) {
    return this.request('/inventory/adjust-base-stock', {
      method: 'POST',
      body: JSON.stringify({ district, productId, newStock })
    });
  },

  // Customer Sale Orders (Direct Product + Editable Price)
  async createOrder(orderData) {
    return this.request('/orders/create-order', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  },

  async createSchemeOrder(orderData) {
    return this.createOrder(orderData);
  },

  async deleteOrder(district, date, id) {
    return this.request(`/orders/${encodeURIComponent(district)}/${encodeURIComponent(date)}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  async getDistrictCustomerOrders(district, date) {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`/orders/district/${encodeURIComponent(district)}${q}`);
  },

  // Rolling Day Cash Ledger & Detailed Cash History
  async getDailyCashLedger(district, date) {
    return this.request(`/cash/daily-ledger/${encodeURIComponent(district)}/${encodeURIComponent(date)}`);
  },

  async getDistrictFullCashHistory(district) {
    return this.request(`/cash/district-full-history/${encodeURIComponent(district)}`);
  },

  async recordAdminPayment(paymentData) {
    return this.request('/cash/admin-payment', {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
  },

  // District DC Rules
  async getDcRules() {
    return this.request('/admin/dc-rules');
  },

  async updateDistrictDc(district, rule) {
    return this.request('/admin/update-district-dc', {
      method: 'POST',
      body: JSON.stringify({ district, rule })
    });
  },

  // Google Sheets Database Integration
  async getSheetsConfig() {
    return this.request('/sheets/config');
  },

  async updateSheetsConfig(config) {
    return this.request('/sheets/config', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  },

  async syncAllToSheets(date) {
    return this.request('/sheets/sync-all', {
      method: 'POST',
      body: JSON.stringify({ date })
    });
  },

  async syncDistrictToSheets(district, date) {
    return this.request('/sheets/sync-district', {
      method: 'POST',
      body: JSON.stringify({ district, date })
    });
  },

  async getSheetsScriptTemplate() {
    return this.request('/sheets/script-template');
  },

  // Stock Transfers & Dispatch System
  async dispatchStock(district, itemsOrProductId, qtyOrChallan, challanNo, note) {
    let payload = {};
    if (Array.isArray(itemsOrProductId)) {
      payload = {
        district,
        items: itemsOrProductId,
        challanNo: qtyOrChallan,
        note: challanNo
      };
    } else {
      payload = {
        district,
        productId: itemsOrProductId,
        qty: qtyOrChallan,
        challanNo,
        note
      };
    }

    return this.request('/inventory/dispatch-stock', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getDistrictTransfers(district) {
    return this.request(`/inventory/transfers/${encodeURIComponent(district)}`);
  },

  async getAllTransfersAdmin() {
    return this.request('/inventory/admin/all-transfers');
  },

  async acceptStockTransfer(transferId, date) {
    return this.request(`/inventory/accept-stock/${encodeURIComponent(transferId)}`, {
      method: 'POST',
      body: JSON.stringify({ date })
    });
  },

  async declineStockTransfer(transferId, reason) {
    return this.request(`/inventory/decline-stock/${encodeURIComponent(transferId)}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  // District & Dealer Management
  async getDistricts() {
    return this.request('/admin/districts');
  },

  async addDistrict(district, username, password, name, dcRate) {
    return this.request('/admin/add-district', {
      method: 'POST',
      body: JSON.stringify({ district, username, password, name, dcRate })
    });
  },

  async deleteDistrict(district) {
    return this.request('/admin/delete-district', {
      method: 'POST',
      body: JSON.stringify({ district })
    });
  },

  async updateDealer(userId, username, password, name, district) {
    return this.request('/admin/update-dealer', {
      method: 'POST',
      body: JSON.stringify({ userId, username, password, name, district })
    });
  },

  // DC Rules Management
  async getDcRules() {
    return this.request('/admin/dc-rules');
  },

  async updateDistrictDc(district, rule) {
    return this.request('/admin/update-district-dc', {
      method: 'POST',
      body: JSON.stringify({ district, rule })
    });
  },

  // Activity Logs
  async getActivityLogs(filters = {}) {
    const params = new URLSearchParams();
    if (filters.user) params.append('user', filters.user);
    if (filters.district) params.append('district', filters.district);
    if (filters.action) params.append('action', filters.action);
    if (filters.limit) params.append('limit', filters.limit);
    return this.request(`/admin/activity-logs?${params.toString()}`);
  }
};

window.API = API;
