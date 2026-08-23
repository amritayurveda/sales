// public/js/app.js

(function() {
  const DISTRICTS = [
    "Chittorgarh", "Alwar", "Bikaner", "Uttarakhand", "Udham Singh Nagar", "Jodhpur",
    "Kota", "Faridabad", "Gurgaon", "Rewari", "Muzaffarnagar", "Shamli"
  ];

  function getTodayDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const state = {
    user: null,
    serverToday: getTodayDateStr(),
    currentDate: getTodayDateStr(), // Always auto-selects TODAY's date for everyone
    currentDistrict: "Chittorgarh",
    districts: [...DISTRICTS],
    dayStock: null,
    dayCash: null,
    customerOrders: [],
    isReadOnly: false,
    currentView: 'district', // 'district' | 'admin'
    dealerView: 'home',
    adminTab: 'matrix',
    adminOverviewData: null,
    lastLiveSyncTimestamp: 0,
    liveSyncTimer: null
  };

  // Utilities
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => {
    n = Number(n) || 0;
    const r = Math.round(n * 100) / 100;
    return r.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };
  const escapeHtml = (str) => {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  };

  function showToast(msg, type = 'info') {
    const container = $('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Initialization
  async function init() {
    setupAuthListeners();
    const token = API.getToken();
    if (token) {
      try {
        const res = await API.getMe();
        state.user = res.user;
        state.serverToday = res.serverToday || getTodayDateStr();
        state.currentDate = state.serverToday; // Auto-select today date for everyone
        state.dealerView = 'home';
        if (state.user.role === 'dealer' && state.user.district) {
          state.currentDistrict = state.user.district;
        }
        renderApp();
        return;
      } catch (e) {
        API.setToken(null);
      }
    }
    renderLoginView();
  }

  function setupAuthListeners() {
    window.addEventListener('auth:unauthorized', () => {
      state.user = null;
      renderLoginView();
      showToast('Please log in to continue', 'error');
    });
  }

  // Render Login View
  async function renderLoginView() {
    $('app-root').innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="auth-header">
            <h1 class="brand-font">Sales Register Pro</h1>
            <p>Enterprise Multi-District Portal</p>
          </div>
          <div class="auth-body">
            <form id="loginForm">
              <div class="form-group">
                <label for="usernameInput">Username / Dealer ID</label>
                <input type="text" id="usernameInput" class="form-input" placeholder="Enter your username or dealer ID" required autofocus autocomplete="username">
              </div>
              <div class="form-group">
                <label for="passwordInput">Password</label>
                <input type="password" id="passwordInput" class="form-input" placeholder="••••••••" required autocomplete="current-password">
              </div>
              <button type="submit" id="loginBtn" class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;font-size:15px;font-weight:700;">Sign In</button>
            </form>
          </div>
        </div>
      </div>
    `;

    window.performLogin = async (u, p) => {
      const btn = $('loginBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Authenticating...';
      }
      try {
        const res = await API.login(u, p);
        API.setToken(res.token);
        state.user = res.user;
        state.serverToday = res.serverToday || getTodayDateStr();
        state.currentDate = state.serverToday; // Auto-select today date for everyone
        state.dealerView = 'home';
        if (state.user.role === 'dealer' && state.user.district) {
          state.currentDistrict = state.user.district;
        }
        showToast(`Welcome, ${state.user.name || state.user.username}!`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message || 'Login failed', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Sign In';
        }
      }
    };

    $('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const u = $('usernameInput').value.trim();
      const p = $('passwordInput').value;
      window.performLogin(u, p);
    });
  }

  // Main App Shell
  async function renderApp() {
    const isAdmin = state.user && state.user.role === 'admin';

    $('app-root').innerHTML = `
      <div class="app-container" style="max-width:1380px;">
        <!-- Top Navbar -->
        <div class="navbar">
          <div class="nav-brand">
            <h1>Sales Register Pro</h1>
            <span class="role-badge ${state.user.role}">${state.user.role}</span>
            <div class="user-tag" style="display:flex;align-items:center;gap:8px;">
              <span>👤 ${escapeHtml(state.user.name || state.user.username)}</span>
              ${state.user.district ? `<span>• 📍 <strong>${escapeHtml(state.user.district)}</strong></span>` : ''}
              ${isAdmin ? `<span id="liveSyncBadgeContainer" class="live-sync-badge"><span class="live-dot"></span> LIVE AUTO-SYNC</span>` : ''}
            </div>
          </div>

          <div class="nav-controls">
            ${isAdmin ? `
              <button id="adminConsoleBtn" class="btn btn-brass">⚙️ Admin Console</button>
            ` : ''}

            <!-- Date Navigator -->
            <div class="datebar">
              <button id="prevDayBtn" title="Previous day">‹</button>
              <div class="date-display">
                <input type="date" id="dateSelector" value="${state.currentDate}">
                <span class="weekday" id="weekdayDisplay">—</span>
              </div>
              <button id="nextDayBtn" title="Next day">›</button>
              <button id="todayJumpBtn" class="btn btn-secondary today-btn">Today</button>
            </div>

            <button id="exportCsvBtn" class="btn btn-secondary">📥 Export CSV</button>
            <button id="logoutBtn" class="btn btn-danger btn-sm">Log Out</button>
          </div>
        </div>

        <!-- District Strip for Admin -->
        ${isAdmin ? `
          <div class="district-strip" id="adminDistrictStrip"></div>
        ` : ''}

        <!-- Status & Same-Day Security Banner -->
        <div id="statusBanner" class="status-banner"></div>

        <!-- Main Content Area -->
        <div id="mainContent"></div>
      </div>
    `;

    setupHeaderEvents();
    if (isAdmin) {
      renderAdminDistrictStrip();
    }

    startRealtimeLiveSync();
    await loadDistrictData();
  }

  function setupHeaderEvents() {
    $('logoutBtn').addEventListener('click', () => {
      stopRealtimeLiveSync();
      API.setToken(null);
      state.user = null;
      renderLoginView();
      showToast('Logged out successfully');
    });

    $('prevDayBtn').addEventListener('click', () => {
      const d = new Date(state.currentDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      switchDate(d.toISOString().slice(0, 10));
    });

    $('nextDayBtn').addEventListener('click', () => {
      const d = new Date(state.currentDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      switchDate(d.toISOString().slice(0, 10));
    });

    $('todayJumpBtn').addEventListener('click', () => {
      switchDate(state.serverToday);
    });

    $('dateSelector').addEventListener('change', (e) => {
      switchDate(e.target.value);
    });

    $('exportCsvBtn').addEventListener('click', exportExcelCsv);

    if ($('adminConsoleBtn')) {
      $('adminConsoleBtn').addEventListener('click', () => {
        state.currentView = 'admin';
        state.adminTab = state.adminTab || 'matrix';
        renderAdminConsole();
      });
    }
  }

  function renderAdminDistrictStrip() {
    const strip = $('adminDistrictStrip');
    if (!strip) return;
    strip.innerHTML = '';
    const list = (state.districts && state.districts.length > 0) ? state.districts : DISTRICTS;
    list.forEach(dist => {
      const pill = document.createElement('button');
      pill.className = 'dist-pill' + (dist === state.currentDistrict && state.currentView === 'district' ? ' active' : '');
      pill.textContent = dist;
      pill.addEventListener('click', () => {
        state.currentView = 'district';
        state.currentDistrict = dist;
        renderAdminDistrictStrip();
        loadDistrictData();
      });
      strip.appendChild(pill);
    });
  }

  // Real-Time Live Sync (Zero-Delay Instant Updates)
  function startRealtimeLiveSync() {
    stopRealtimeLiveSync();
    state.lastLiveSyncTimestamp = Date.now();

    state.liveSyncTimer = setInterval(async () => {
      if (!state.user) return;
      try {
        const res = await API.getAdminLiveFeed(state.currentDate, state.lastLiveSyncTimestamp);
        if (!res) return;

        if (state.lastLiveSyncTimestamp === 0) {
          state.lastLiveSyncTimestamp = res.lastTimestamp || res.serverTime;
          return;
        }

        if (res.hasNew && res.lastTimestamp > state.lastLiveSyncTimestamp) {
          state.lastLiveSyncTimestamp = res.lastTimestamp;

          // Flash live indicator badge
          const badge = $('liveSyncBadgeContainer');
          if (badge) {
            badge.classList.add('flash');
            badge.innerHTML = `<span class="live-dot" style="background:#FFE873;"></span> ⚡ NEW SALE LIVE`;
            setTimeout(() => {
              const b = $('liveSyncBadgeContainer');
              if (b) {
                b.classList.remove('flash');
                b.innerHTML = `<span class="live-dot"></span> LIVE AUTO-SYNC`;
              }
            }, 3000);
          }

          if (res.latestOrder) {
            const ord = res.latestOrder;
            showToast(`⚡ New Sale in ${ord.district}! #${ord.orderNo}: ${ord.productName} (₹${fmt(ord.unitPrice)})`, 'success');
          }

          // Real-time instantaneous auto-refresh without kicking user out of admin view
          if (state.currentView === 'admin') {
            if (state.adminTab === 'matrix' && $('adminOverviewMatrixBody')) {
              await loadAdminMatrix();
            } else if (state.adminTab === 'activity') {
              await loadAdminActivityLogs();
            }
          } else {
            // If user is actively typing or selecting in the Add Sale form, do not destroy form DOM
            const isFormActive = $('fastSchemeForm') && (
              (document.activeElement && $('fastSchemeForm').contains(document.activeElement)) ||
              ($('fastProductSelect') && $('fastProductSelect').value) ||
              ($('fastCustomerMobile') && $('fastCustomerMobile').value)
            );
            if (!isFormActive) {
              await loadDistrictData();
            }
          }
        }
      } catch (e) {
        // Silently catch background polling glitches
      }
    }, 2500);
  }

  function stopRealtimeLiveSync() {
    if (state.liveSyncTimer) {
      clearInterval(state.liveSyncTimer);
      state.liveSyncTimer = null;
    }
  }

  function updateDateDisplay() {
    $('dateSelector').value = state.currentDate;
    const d = new Date(state.currentDate + 'T00:00:00');
    $('weekdayDisplay').textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  async function switchDate(newDate) {
    if (!newDate) return;
    state.currentDate = newDate;
    updateDateDisplay();
    if (state.currentView === 'admin') {
      if (state.adminTab === 'matrix') await loadAdminMatrix();
      else if (state.adminTab === 'dispatch') await loadAdminDispatch();
      else if (state.adminTab === 'district-products') await loadAdminDistrictProducts();
    } else {
      await loadDistrictData();
    }
  }

  async function loadDistrictData() {
    updateDateDisplay();

    try {
      const scrollPos = window.scrollY || document.documentElement.scrollTop || 0;

      // 1. Parallel loading of Stock Register, Rolling Day Cash, Full Historical Ledger, and Inward Transfers
      const [stockRes, cashRes, historyRes, transfersRes] = await Promise.all([
        API.getDistrictDayStock(state.currentDistrict, state.currentDate),
        API.getDailyCashLedger(state.currentDistrict, state.currentDate),
        API.getDistrictFullCashHistory(state.currentDistrict),
        API.getDistrictTransfers(state.currentDistrict).catch(() => ({ pendingTransfers: [], pendingCount: 0 }))
      ]);

      state.dayStock = stockRes;
      state.dayCash = cashRes;
      state.districtFullCash = historyRes;
      state.districtTransfers = transfersRes;
      state.customerOrders = cashRes.orders || [];
      state.isReadOnly = (state.user.role !== 'admin' && state.currentDate !== state.serverToday);

      updateStatusBanner();
      renderExcelDashboard();

      // Restore scroll position so screen never jumps down
      if (scrollPos > 0) {
        window.scrollTo({ top: scrollPos, behavior: 'instant' });
      }
    } catch (err) {
      showToast('Error loading district data: ' + err.message, 'error');
      const main = $('mainContent');
      if (main) {
        main.innerHTML = `
          <div style="background:#FFF;border:1px solid var(--danger);border-radius:8px;padding:30px;text-align:center;margin-top:20px;">
            <h3 style="color:var(--danger);margin-top:0;">Unable to Load District Data</h3>
            <p style="color:var(--ink-soft);">${escapeHtml(err.message)}</p>
            <button class="btn btn-primary" onclick="loadDistrictData()">🔄 Retry Loading</button>
          </div>
        `;
      }
    }
  }

  function updateStatusBanner() {
    const banner = $('statusBanner');
    if (!banner) return;

    if (state.isReadOnly) {
      banner.className = 'status-banner warning';
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">🔒</span>
          <div>
            <strong>Historical View (${state.currentDate}):</strong>
            <span> You are viewing past historical reports for <strong>${state.currentDistrict}</strong>. Sales entries and stock modifications are locked for past dates.</span>
          </div>
        </div>
      `;
    } else {
      banner.className = 'status-banner';
      banner.innerHTML = '';
    }
  }

   // Dealer Navigation View: 'home' (Add Sales), 'stock' (Stock Report), 'cash' (Cash Closing)
  function renderExcelDashboard() {
    const main = $('mainContent');
    const isAdmin = state.user && state.user.role === 'admin';
    const cash = state.dayCash || { opCash: 0, todaySalesNet: 0, totalAccumulated: 0, adminCashPaid: 0, closingCash: 0 };
    const stock = state.dayStock || { products: [], inwardNote: '' };
    const pendingTransfers = (state.districtTransfers && state.districtTransfers.pendingTransfers) ? state.districtTransfers.pendingTransfers : [];

    if (!state.dealerView) state.dealerView = 'home';

    let sumGross = 0, sumDC = 0, sumNet = 0;
    state.customerOrders.forEach(o => {
      sumGross += (Number(o.unitPrice) || 0);
      sumDC += (Number(o.dcRate) || 0);
      sumNet += ((Number(o.unitPrice) || 0) - (Number(o.dcRate) || 0));
    });

    let sumOpening = 0, sumSale = 0, sumRemain = 0, sumMila = 0, sumClosing = 0;
    stock.products.forEach(p => {
      sumOpening += p.openingStock || 0;
      sumSale += p.saleQty || 0;
      sumRemain += p.remainStock || 0;
      sumMila += p.milaQty || 0;
      sumClosing += p.closingStock || 0;
    });

    let contentHtml = '';

    // Top View Switcher Bar
    const topBarHtml = `
      <div class="dealer-tabs-wrap">
        <div class="dealer-subtabs">
          <button class="dealer-subtab-btn ${state.dealerView === 'home' ? 'active' : ''}" onclick="switchDealerView('home')">
            <span>⚡</span> <span>Add Sale</span>
          </button>
          <button class="dealer-subtab-btn ${state.dealerView === 'stock' ? 'active' : ''}" onclick="switchDealerView('stock')">
            <span>📦</span> <span>Stock (${stock.products.length})</span>
            ${pendingTransfers.length > 0 ? `<span class="mila-tag" style="background:#FFE873;color:#5C4B00;font-size:10px;">+${pendingTransfers.length} In-Transit</span>` : ''}
          </button>
          <button class="dealer-subtab-btn ${state.dealerView === 'cash' ? 'active' : ''}" onclick="switchDealerView('cash')">
            <span>💰</span> <span>Cash (₹${fmt(cash.closingCash)})</span>
          </button>
        </div>

        <div class="dealer-stats-strip">
          <div class="dealer-stat-box">
            <span style="color:var(--ink-soft);">Today Net:</span>
            <strong class="mono" style="color:var(--good);font-size:14px;">₹${fmt(cash.todaySalesNet)}</strong>
            <span style="color:var(--ink-soft);font-size:11px;">(${state.customerOrders.length} orders)</span>
          </div>
          <div class="dealer-stat-box">
            <span style="color:var(--ink-soft);">Closing Cash:</span>
            <strong class="mono" style="color:var(--brass-deep);font-size:14px;">₹${fmt(cash.closingCash)}</strong>
          </div>
        </div>
      </div>
    `;

    // Incoming Stock Shipments Alert Banner (For Dealers)
    const incomingShipmentsHtml = pendingTransfers.length === 0 ? '' : `
      <div class="incoming-stock-card">
        <div class="incoming-stock-header">
          <span>📦 <strong>${pendingTransfers.length} Incoming Stock Consignment(s) Dispatched by Admin</strong></span>
          <span class="type-pill Opening" style="font-size:11px;">🟡 In-Transit (Pending Receipt)</span>
        </div>
        <div class="incoming-stock-list">
          ${pendingTransfers.map(t => {
            const hasItems = t.items && Array.isArray(t.items) && t.items.length > 0;
            const totalUnits = t.totalUnits || t.qty;
            const itemsHtml = hasItems ? `
              <div class="incoming-item-chips">
                ${t.items.map(it => `
                  <span class="inward-item-badge">
                    <strong>${escapeHtml(it.productName)}</strong>: <span class="mono" style="color:var(--good);font-weight:700;">+${it.qty} Units</span>
                  </span>
                `).join('')}
              </div>
            ` : '';

            const title = hasItems
              ? `Consignment Ref: ${t.transferNo} (${t.items.length} Products • ${totalUnits} Total Units)`
              : `${escapeHtml(t.productName)} (+${t.qty} Units)`;

            return `
              <div class="incoming-stock-item">
                <div style="flex:1;">
                  <strong style="font-size:15px;color:var(--ink);">${title}</strong>
                  ${itemsHtml}
                  <div style="font-size:12px;color:var(--ink-soft);margin-top:6px;">
                    Dispatched on <strong>${t.dispatchedAt.slice(0, 10)}</strong> by <strong>${escapeHtml(t.dispatchedBy)}</strong> • Ref: <code class="mono">${t.transferNo}</code>
                    ${t.challanNo ? ` • Challan/Tracking: <strong>${escapeHtml(t.challanNo)}</strong>` : ''}
                    ${t.note ? ` • Note: <em>"${escapeHtml(t.note)}"</em>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <button class="btn-accept-stock" onclick="dealerAcceptStockTransfer('${t.id}', '${escapeHtml(t.transferNo)}', ${totalUnits})">
                    ✅ Accept (+${totalUnits} Units)
                  </button>
                  <button class="btn btn-secondary btn-sm" style="color:var(--danger);border-color:var(--danger);font-weight:700;height:44px;padding:0 14px;background:#FFF;" onclick="dealerDeclineStockTransfer('${t.id}', '${escapeHtml(t.transferNo)}')">
                    ❌ Decline
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // 1. HOME VIEW: CLEAN ADD SALES & TODAY'S ORDERS
    if (state.dealerView === 'home') {
      contentHtml = `
        <div style="display:grid;grid-template-columns:1fr;gap:16px;">
          ${incomingShipmentsHtml}

          <!-- Mobile-Optimized Fast Order Card -->
          <div class="fast-order-box">
            <div class="fast-order-header">
              <h2 style="font-size:16px;color:var(--brass-deep);margin:0;display:flex;align-items:center;gap:6px;">
                ⚡ New Customer Sale Entry
              </h2>
              <span style="font-size:11.5px;color:var(--ink-soft);font-weight:600;">
                Auto-DC &amp; Instant Stock Deduct
              </span>
            </div>

            <div class="fast-order-body">
              <form id="fastSchemeForm">
                <div class="fast-form-grid">
                  
                  <!-- Field 1: Choose Product -->
                  <div>
                    <label class="field-label">1. Select Product *</label>
                    <select id="fastProductSelect" class="input-lg" required ${state.isReadOnly ? 'disabled' : ''}>
                      <option value="">-- Choose Product --</option>
                      ${stock.products.map(p => `
                        <option value="${p.productId}" data-name="${escapeHtml(p.name)}" data-price="${p.schemePrice || 2500}" data-stock="${p.closingStock}">
                          ${escapeHtml(p.name)} (Stock: ${p.closingStock})
                        </option>
                      `).join('')}
                    </select>
                  </div>

                  <div class="fast-form-mobile-row">
                    <!-- Field 2: Product Price -->
                    <div>
                      <label class="field-label">2. Price (₹) *</label>
                      <input type="number" id="fastProductPrice" class="input-lg mono" placeholder="₹ Price" min="1" step="1" inputmode="numeric" style="font-weight:700;" required ${state.isReadOnly ? 'disabled' : ''}>
                    </div>

                    <!-- Field 3: Customer Mobile -->
                    <div>
                      <label class="field-label">3. Mobile No. *</label>
                      <input type="tel" id="fastCustomerMobile" class="input-lg mono" placeholder="📱 10 Digits" pattern="[0-9]{8,15}" inputmode="tel" maxlength="15" required ${state.isReadOnly ? 'disabled' : ''}>
                    </div>
                  </div>

                  <!-- Field 4: Add Button -->
                  <div>
                    <button type="submit" id="fastAddBtn" class="btn-add-order" ${state.isReadOnly ? 'disabled' : ''}>
                      ➕ Add Sale Order
                    </button>
                  </div>
                </div>

                <!-- Field 5: Optional Customer Name / Note -->
                <div style="margin-top:10px;">
                  <input type="text" id="fastCustomerName" class="form-input" placeholder="Customer Name / Optional Note" style="font-size:14px;padding:8px 12px;width:100%;border-radius:6px;" ${state.isReadOnly ? 'disabled' : ''}>
                </div>

                <!-- Live Calculation Preview Strip -->
                <div id="fastPreviewStrip" class="calc-preview-card" style="display:none;">
                  <div>
                    Sale Price: <strong class="mono" id="prevPrice">₹0</strong>
                    &nbsp;•&nbsp; Delivery Charge (DC): <strong class="mono" style="color:var(--danger);" id="prevDC">-₹0</strong>
                    &nbsp;•&nbsp; Net Cash: <strong class="mono" style="color:var(--good);font-size:17px;" id="prevNet">₹0</strong>
                  </div>
                  <span class="stock-pill in-stock" id="prevStockBadge">In Stock</span>
                </div>
              </form>
            </div>
          </div>

          <!-- Today's Orders Log -->
          <div class="card">
            <div class="card-header excel-head-yellow" style="display:flex;justify-content:space-between;align-items:center;">
              <h2 style="margin:0;font-size:15px;">📋 TODAY'S ORDERS &amp; CUSTOMER DELIVERIES (<span class="mono">${state.currentDate}</span>)</h2>
              <span class="mono" style="font-size:12px;font-weight:700;">TOTAL TODAY NET SALES: ₹${fmt(cash.todaySalesNet)}</span>
            </div>

            <div class="table-wrap" style="max-height:420px;">
              <table>
                <thead class="excel-head-yellow">
                  <tr>
                    <th>ORDER #</th>
                    <th>PRODUCT / SCHEME</th>
                    <th style="text-align:right;">PRICE</th>
                    <th style="text-align:right;color:var(--danger);">DC</th>
                    <th style="text-align:right;">NET TOTAL</th>
                    <th>CUSTOMER MOBILE</th>
                    <th>TIME</th>
                    <th style="text-align:center;width:105px;">${isAdmin ? 'ADMIN' : 'STATUS'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.customerOrders.length === 0 ? `
                    <tr><td colspan="8" style="padding:30px;text-align:center;color:var(--ink-soft);">No customer deliveries recorded for this date yet. Use the form above to add sales.</td></tr>
                  ` : state.customerOrders.map(o => `
                    <tr>
                      <td class="mono"><strong>${escapeHtml(o.orderNo)}</strong></td>
                      <td class="prod-name">
                        <strong>${escapeHtml(o.schemeName || o.productName)}</strong>
                        <span style="font-size:10.5px;color:var(--ink-soft);display:block;">${escapeHtml(o.productName)} &times; ${o.qty}</span>
                      </td>
                      <td style="text-align:right;" class="mono">₹${fmt(o.unitPrice || o.totalAmount)}</td>
                      <td style="text-align:right;color:var(--danger);" class="mono">-₹${fmt(o.dcRate)}</td>
                      <td style="text-align:right;font-weight:700;" class="tot mono">₹${fmt(o.netAmount || (o.unitPrice - o.dcRate))}</td>
                      <td>
                        <span class="mobile-badge">📱 ${escapeHtml(o.customerMobile)}</span>
                        ${o.customerName ? `<span style="font-size:11px;color:var(--ink-soft);display:block;">${escapeHtml(o.customerName)}</span>` : ''}
                      </td>
                      <td class="mono" style="font-size:11px;color:var(--ink-soft);">${escapeHtml(o.time || '—')}</td>
                      <td style="text-align:center;">
                        ${isAdmin ? `
                          <button class="btn btn-danger btn-sm" style="padding:4px 9px;font-size:11px;font-weight:700;background:#E53935;color:#FFF;border:none;border-radius:4px;cursor:pointer;" onclick="adminDeleteSaleOrder('${escapeHtml(o.district || state.currentDistrict)}', '${escapeHtml(o.date || state.currentDate)}', '${escapeHtml(o.id)}', '${escapeHtml(o.orderNo)}', '${escapeHtml(o.productName)}', ${o.unitPrice})">
                            🗑️ Delete
                          </button>
                        ` : `
                          <span class="type-pill Opening" style="font-size:10px;padding:3px 7px;">🔒 Locked</span>
                        `}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr class="excel-head-yellow">
                    <td colspan="2">TOTAL TODAY</td>
                    <td style="text-align:right;">₹${fmt(sumGross)}</td>
                    <td style="text-align:right;color:var(--danger);">-₹${fmt(sumDC)}</td>
                    <td style="text-align:right;">₹${fmt(cash.todaySalesNet)}</td>
                    <td colspan="3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // 2. STOCK REPORT VIEW: FULL EXCEL STOCK REGISTER
    else if (state.dealerView === 'stock') {
      contentHtml = `
        <div class="card">
          <div class="card-header excel-head-yellow" style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h2 style="margin:0;font-size:16px;">📦 STOCK REPORT — ${escapeHtml(state.currentDistrict)} (<span class="mono">${state.currentDate}</span>)</h2>
              <span class="mono" style="font-size:11px;font-weight:700;">Formula: (Quantity - Sale) + Mila = Closing Stock</span>
            </div>
            ${state.user.role === 'admin' ? `
              <button class="btn btn-primary btn-sm" onclick="promptAdminAddDistrictProduct()" style="font-weight:600;">➕ Add Product to ${escapeHtml(state.currentDistrict)}</button>
            ` : ''}
          </div>

          <div class="table-wrap" style="max-height:600px;">
            <table>
              <thead class="excel-head-yellow">
                <tr>
                  <th style="width:24px;">#</th>
                  <th>PRODUCT NAME</th>
                  <th style="text-align:right;">QUANTITY (OPENING)</th>
                  <th style="text-align:right;color:#A63D40;">SALE</th>
                  <th style="text-align:right;">TOTAL (REMAIN)</th>
                  <th style="text-align:right;color:#2D6A12;">MILA (INWARD)</th>
                  <th style="text-align:right;">TOTAL (CLOSING STOCK)</th>
                  ${state.user.role === 'admin' ? '<th style="width:24px;"></th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${stock.products.map((p, idx) => `
                  <tr class="${p.milaQty > 0 ? 'highlight-row-mila' : ''}">
                    <td class="mono" style="font-size:10.5px;color:var(--ink-soft);">${idx + 1}</td>
                    <td class="prod-name">
                      <strong>${escapeHtml(p.name)}</strong>
                      ${state.user.role === 'admin' ? `
                        <button class="btn-icon" style="font-size:11px;" onclick="promptAdminEditStock('${p.productId}', '${escapeHtml(p.name)}', ${p.openingStock})" title="Edit Base Stock">✏️</button>
                      ` : ''}
                    </td>
                    <td style="text-align:right;" class="mono">${fmt(p.openingStock)}</td>
                    <td style="text-align:right;font-weight:700;color:var(--danger);" class="mono">
                      ${p.saleQty > 0 ? fmt(p.saleQty) : '—'}
                    </td>
                    <td style="text-align:right;" class="mono">${fmt(p.remainStock)}</td>
                    <td style="text-align:right;" class="mono">
                      ${p.milaQty > 0 ? `<span class="mila-tag">+${fmt(p.milaQty)}</span>` : '—'}
                      ${state.user.role === 'admin' ? `
                        <button class="btn-icon" style="font-size:10px;" onclick="promptAdminMilaInward('${p.productId}', '${escapeHtml(p.name)}', ${p.milaQty || 0})" title="Add Mila Inward">➕</button>
                      ` : ''}
                    </td>
                    <td style="text-align:right;font-weight:700;" class="tot mono">${fmt(p.closingStock)}</td>
                    ${state.user.role === 'admin' ? `
                      <td style="text-align:center;">
                        <button class="btn-icon" style="color:var(--danger);font-size:13px;" onclick="promptAdminDeleteDistrictProduct('${p.productId}', '${escapeHtml(p.name)}')" title="Delete product completely from ${state.currentDistrict}">🗑️</button>
                      </td>
                    ` : ''}
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr class="excel-head-yellow">
                  <td colspan="2">TOTALS</td>
                  <td style="text-align:right;">${fmt(sumOpening)}</td>
                  <td style="text-align:right;color:var(--danger);">${fmt(sumSale)}</td>
                  <td style="text-align:right;">${fmt(sumRemain)}</td>
                  <td style="text-align:right;color:var(--good);">+${fmt(sumMila)}</td>
                  <td style="text-align:right;">${fmt(sumClosing)}</td>
                  ${state.user.role === 'admin' ? '<td></td>' : ''}
                </tr>
              </tfoot>
            </table>
          </div>

          <div style="background:#F5F7EC;padding:12px 16px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;font-size:13px;">
            <div>
              <strong>Inward Notes (Mila):</strong>
              <span class="mono" style="margin-left:8px;color:var(--ink-soft);" id="inwardNotesDisplay">
                ${escapeHtml(stock.inwardNote || 'No inward notes logged for today')}
              </span>
            </div>
            ${state.user.role === 'admin' ? `
              <button class="btn btn-secondary btn-sm" onclick="promptAdminInwardNotes()">✏️ Edit Note</button>
            ` : ''}
          </div>
        </div>
      `;
    }

    // 3. CASH CLOSING & LEDGER VIEW (FULL DETAILED CASH STATEMENT)
    else if (state.dealerView === 'cash') {
      const fullHistory = state.districtFullCash || { dailyLedger: [], allTransactions: [], totals: {} };
      if (!state.cashDetailTab) state.cashDetailTab = 'daily';

      contentHtml = `
        <div>
          <!-- Top Row: Today's Excel Rolling Stamp & Lifetime Metrics -->
          <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:18px;margin-bottom:18px;">
            <!-- Rolling Cash Ledger for Current Selected Date -->
            <div class="rolling-cash-box" style="margin-top:0;">
              <div class="card-header excel-head-yellow" style="border:none;">
                <h2 style="margin:0;font-size:16px;">💰 CASH RECONCILIATION — ${escapeHtml(state.currentDistrict)}</h2>
                <span class="mono">${state.currentDate}</span>
              </div>

              <div class="cash-box-row" style="background:#FFF9D2;">
                <span><strong>TOTAL TODAY NET SALES:</strong></span>
                <span class="mono" style="font-size:17px;font-weight:700;color:var(--ink);">₹${fmt(cash.todaySalesNet)}</span>
              </div>

              <div class="cash-box-row">
                <span><strong>OP (LAST DAY CLOSING CASH):</strong></span>
                <span class="mono" style="font-size:16px;font-weight:600;color:var(--ink-soft);">+₹${fmt(cash.opCash)}</span>
              </div>

              <div class="cash-box-row total-row">
                <span>TOTAL CASH ACCUMULATED (SALES + OP):</span>
                <span class="mono" style="font-size:18px;color:#8E6526;">₹${fmt(cash.totalAccumulated)}</span>
              </div>

              <div class="cash-box-row" style="background:#FDF2F2;">
                <div>
                  <span style="font-weight:700;color:var(--danger);font-size:14px;">CASH PAID TO COMPANY (ADMIN ONLY):</span>
                  <span style="font-size:11px;color:var(--ink-soft);display:block;">Deductions recorded exclusively upon Admin receipt</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="mono amt neg" style="font-size:17px;font-weight:700;">-₹${fmt(cash.adminCashPaid)}</span>
                  ${state.user.role === 'admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="promptAdminCashPayment()">💵 Record Payment</button>
                  ` : ''}
                </div>
              </div>

              <div class="cash-box-row final-closing">
                <div>
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#C9D2C1;">FINAL CLOSING CASH (CARRIES TO NEXT DAY)</div>
                  <div style="font-size:13px;color:#A9B39B;margin-top:2px;">Tomorrow Opening Cash: ₹${fmt(cash.closingCash)}</div>
                </div>
                <div class="stamp-val mono">₹${fmt(cash.closingCash)}</div>
              </div>
            </div>

            <!-- Summary Cards Banner -->
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div class="card" style="padding:16px;background:#FAFBF6;border-left:4px solid var(--good);">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);">Lifetime Sales Collected (${escapeHtml(state.currentDistrict)})</div>
                <div class="mono" style="font-size:24px;font-weight:700;color:var(--good);margin-top:4px;">₹${fmt(fullHistory.totals.totalSalesLifetime || cash.todaySalesNet)}</div>
                <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">Sum of all customer deliveries after DC deductions</div>
              </div>

              <div class="card" style="padding:16px;background:#FAFBF6;border-left:4px solid var(--danger);">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);">Total Cash Paid to Company (${escapeHtml(state.currentDistrict)})</div>
                <div class="mono amt neg" style="font-size:24px;font-weight:700;margin-top:4px;">-₹${fmt(fullHistory.totals.totalPaidLifetime || cash.adminCashPaid)}</div>
                <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">Verified Admin deposit collections</div>
              </div>

              <div class="card" style="padding:16px;background:#FAFBF6;border-left:4px solid var(--brass);">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);">Current Closing Cash Balance (${escapeHtml(state.currentDistrict)})</div>
                <div class="mono" style="font-size:24px;font-weight:700;color:var(--brass-deep);margin-top:4px;">₹${fmt(fullHistory.totals.currentBalance !== undefined ? fullHistory.totals.currentBalance : cash.closingCash)}</div>
                <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">Rolling day-over-day net cash balance in hand</div>
              </div>
            </div>
          </div>

          <!-- Bottom Section: Detailed Multi-Day Cash Statement & Itemized Entries -->
          <div class="card">
            <div class="card-header excel-head-yellow" style="display:flex;justify-content:space-between;align-items:center;">
              <div class="admin-nav" style="margin:0;border:none;">
                <button class="admin-tab ${state.cashDetailTab === 'daily' ? 'active' : ''}" style="background:#FFF;" onclick="switchCashDetailTab('daily')">
                  📅 Day-by-Day Historical Cash Ledger (${(fullHistory.dailyLedger || []).length} Days)
                </button>
                <button class="admin-tab ${state.cashDetailTab === 'itemized' ? 'active' : ''}" style="background:#FFF;" onclick="switchCashDetailTab('itemized')">
                  📋 Itemized Every Cash Entry (${(fullHistory.allTransactions || []).length} Entries)
                </button>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="exportDetailedCashStatementCsv()">📥 Export Cash Statement CSV</button>
            </div>

            <!-- Tab 1: Day-by-Day Historical Cash Table -->
            ${state.cashDetailTab === 'daily' ? `
              <div class="table-wrap" style="max-height:500px;">
                <table>
                  <thead class="excel-head-yellow">
                    <tr>
                      <th>DATE</th>
                      <th style="text-align:right;">OP (OPENING CASH)</th>
                      <th style="text-align:right;color:var(--good);">TODAY SALES NET</th>
                      <th style="text-align:right;">TOTAL ACCUMULATED</th>
                      <th style="text-align:right;color:var(--danger);">CASH PAID TO COMPANY</th>
                      <th style="text-align:right;">FINAL CLOSING CASH</th>
                      <th style="text-align:center;">DELIVERIES</th>
                      <th style="text-align:center;">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(fullHistory.dailyLedger || []).length === 0 ? `
                      <tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-soft);">No historical cash ledger records for this district yet.</td></tr>
                    ` : (fullHistory.dailyLedger || []).map(row => `
                      <tr class="${row.date === state.currentDate ? 'highlight-row-mila' : ''}">
                        <td class="mono">
                          <strong>${row.date}</strong>
                          ${row.date === state.currentDate ? '<span class="type-pill Opening" style="font-size:9px;margin-left:4px;">Viewing</span>' : ''}
                        </td>
                        <td style="text-align:right;" class="mono">₹${fmt(row.opCash)}</td>
                        <td style="text-align:right;font-weight:700;color:var(--good);" class="mono">₹${fmt(row.todaySalesNet)}</td>
                        <td style="text-align:right;" class="mono">₹${fmt(row.totalAccumulated)}</td>
                        <td style="text-align:right;font-weight:700;color:var(--danger);" class="mono">
                          ${row.adminCashPaid > 0 ? `-₹${fmt(row.adminCashPaid)}` : '—'}
                        </td>
                        <td style="text-align:right;font-weight:700;" class="tot mono">₹${fmt(row.closingCash)}</td>
                        <td style="text-align:center;" class="mono">${row.ordersCount} orders</td>
                        <td style="text-align:center;">
                          <button class="btn btn-secondary btn-sm" onclick="switchDate('${row.date}')">Open Date</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <!-- Tab 2: Itemized Every Single Cash Entry -->
              <div class="table-wrap" style="max-height:500px;">
                <table>
                  <thead class="excel-head-yellow">
                    <tr>
                      <th>DATE / TIME</th>
                      <th>ENTRY TYPE</th>
                      <th>DETAILS / CUSTOMER</th>
                      <th style="text-align:right;">GROSS PRICE</th>
                      <th style="text-align:right;color:var(--danger);">DC DEDUCTED</th>
                      <th style="text-align:right;">NET CASH EFFECT</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(fullHistory.allTransactions || []).length === 0 ? `
                      <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink-soft);">No cash transactions recorded for this district yet.</td></tr>
                    ` : (fullHistory.allTransactions || []).map(t => `
                      <tr>
                        <td class="mono">
                          <strong>${t.date}</strong>
                          <span style="font-size:10.5px;color:var(--ink-soft);display:block;">${t.time}</span>
                        </td>
                        <td>
                          ${t.type === 'CUSTOMER_SALE' ? `
                            <span class="activity-badge CUSTOMER_SALE">Customer Sale</span>
                          ` : `
                            <span class="activity-badge CASH_SETTLEMENT">Company Deposit</span>
                          `}
                        </td>
                        <td>
                          <strong>${escapeHtml(t.title)}</strong>
                          ${t.customerMobile && t.customerMobile !== '—' ? `
                            <span class="mobile-badge" style="margin-left:4px;">📱 ${escapeHtml(t.customerMobile)}</span>
                          ` : ''}
                          ${t.customerName ? `<span style="font-size:11px;color:var(--ink-soft);display:block;">${escapeHtml(t.customerName)}</span>` : ''}
                          ${t.note ? `<span style="font-size:11px;color:var(--ink-light);display:block;">Note: "${escapeHtml(t.note)}"</span>` : ''}
                        </td>
                        <td style="text-align:right;" class="mono">₹${fmt(t.grossPrice)}</td>
                        <td style="text-align:right;color:var(--danger);" class="mono">
                          ${t.dcDeducted > 0 ? `-₹${fmt(t.dcDeducted)}` : '—'}
                        </td>
                        <td style="text-align:right;font-weight:700;" class="mono ${t.entryType === 'INFLOW' ? 'amt pos' : 'amt neg'}">
                          ${t.entryType === 'INFLOW' ? `+₹${fmt(t.netAmount)}` : `-₹${fmt(Math.abs(t.netAmount))}`}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      `;
    }

    main.innerHTML = topBarHtml + contentHtml;

    if (state.dealerView === 'home') {
      setupFastOrderEvents(stock.products);
    }
  }

  window.switchDealerView = (view) => {
    state.dealerView = view;
    renderExcelDashboard();
  };

  window.adminDeleteSaleOrder = async (district, date, id, orderNo, prodName, price) => {
    if (!state.user || state.user.role !== 'admin') {
      showToast('Permission Denied: Only Administrator can delete sales records.', 'error');
      return;
    }

    const confirmed = confirm(`⚠️ Are you sure you want to DELETE this sale order?\n\nOrder Ref: #${orderNo}\nDistrict: ${district}\nProduct: ${prodName}\nPrice: ₹${fmt(price)}\n\nThis will permanently delete the delivery and restore the deducted product stock.`);
    if (!confirmed) return;

    try {
      const res = await API.deleteOrder(district, date, id);
      showToast(res.message || `Sale order #${orderNo} deleted successfully by Admin`, 'success');
      await loadDistrictData();
    } catch (err) {
      showToast('Failed to delete sale order: ' + err.message, 'error');
    }
  };

  function setupFastOrderEvents(products) {
    const prodSel = $('fastProductSelect');
    const priceInp = $('fastProductPrice');
    const mobInp = $('fastCustomerMobile');
    const nameInp = $('fastCustomerName');
    const prevStrip = $('fastPreviewStrip');
    const prevPrice = $('prevPrice');
    const prevDC = $('prevDC');
    const prevNet = $('prevNet');
    const prevStockBadge = $('prevStockBadge');

    function isSpecialProduct(name) {
      if (!name) return false;
      const s = name.toUpperCase();
      const specials = ['PLAY MORE', 'HEIGHT VEDA', 'ALERGY SAFA', 'EYE SUTRA', 'HEIGHT SUTRA', 'ALERGY', 'FOUJI'];
      return specials.some(sp => s.includes(sp));
    }

    function computeDcForDistrict(price, productName) {
      if (isSpecialProduct(productName)) {
        const dist = (state.currentDistrict || '').toUpperCase();
        if (dist.includes('UTTARAKHAND') || dist.includes('UDHAM')) {
          return 170;
        }
        return 150;
      }
      return price <= 1500 ? 200 : 250;
    }

    function updatePricePreview() {
      if (!currentProduct) {
        prevStrip.style.display = 'none';
        return;
      }

      const price = parseFloat(priceInp.value) || 0;
      const dc = computeDcForDistrict(price, currentProduct.name);
      const net = price - dc;

      prevPrice.textContent = `₹${fmt(price)}`;
      prevDC.textContent = `-₹${fmt(dc)}`;
      prevNet.textContent = `₹${fmt(net)}`;

      const stock = currentProduct.closingStock || 0;
      if (stock <= 0) {
        prevStockBadge.className = 'stock-pill out-stock';
        prevStockBadge.textContent = 'Out of Stock';
      } else if (stock < 5) {
        prevStockBadge.className = 'stock-pill low-stock';
        prevStockBadge.textContent = `Low Stock (${stock} left)`;
      } else {
        prevStockBadge.className = 'stock-pill in-stock';
        prevStockBadge.textContent = `In Stock (${stock} units)`;
      }

      prevStrip.style.display = 'flex';
    }

    prodSel.addEventListener('change', () => {
      const pid = prodSel.value;
      currentProduct = products.find(p => p.productId === pid || p.id === pid);

      if (!currentProduct) {
        priceInp.value = '';
        prevStrip.style.display = 'none';
        return;
      }

      // Pre-populate with default price (fully editable)
      const defPrice = currentProduct.schemePrice || currentProduct.defaultPrice || (currentProduct.schemes && currentProduct.schemes[0] ? currentProduct.schemes[0].price : 2500);
      priceInp.value = defPrice;
      updatePricePreview();
    });

    priceInp.addEventListener('input', updatePricePreview);

    // Form Submit (Fast addition with custom editable price & auto-reset)
    $('fastSchemeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.isReadOnly) return;

      const productId = prodSel.value;
      const price = parseFloat(priceInp.value);
      const customerMobile = mobInp.value.trim();
      const customerName = nameInp.value.trim();
      const btn = $('fastAddBtn');

      if (!productId || isNaN(price) || price <= 0 || !customerMobile) {
        showToast('Please select product, enter valid price, and customer mobile', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Adding...';

      try {
        const res = await API.createOrder({
          district: state.currentDistrict,
          date: state.currentDate,
          productId,
          price,
          customerMobile,
          customerName
        });

        showToast(res.message, 'success');

        // Reload data
        await loadDistrictData();

        // Auto-Reset form and focus back to product select for rapid next entry
        prodSel.selectedIndex = 0;
        priceInp.value = '';
        mobInp.value = '';
        nameInp.value = '';
        prevStrip.style.display = 'none';
        prodSel.focus();
      } catch (err) {
        showToast('Failed to record order: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '➕ Add Sale Order';
      }
    });
  }

  window.deleteCustomerOrder = async (orderId) => {
    if (state.user.role !== 'admin') {
      showToast('Deliveries are permanent records and cannot be deleted by dealers.', 'error');
      return;
    }
    if (!confirm('Are you sure you want to void this order as Administrator?')) return;
    try {
      await API.deleteOrder(state.currentDistrict, state.currentDate, orderId);
      showToast('Order removed by Administrator', 'info');
      await loadDistrictData();
    } catch (err) {
      showToast('Error removing order: ' + err.message, 'error');
    }
  };

  // ================= ADMIN ACTIONS =================
  window.promptAdminAddDistrictProduct = async () => {
    try {
      const masterRes = await API.getMasterProducts();
      const masterList = masterRes.products || [];

      if (masterList.length === 0) {
        showToast('No products found in Master Catalog. Add master products in Admin Console first.', 'error');
        return;
      }

      // Check which products are already assigned
      const currentAssignedNames = new Set((state.dayStock && state.dayStock.products ? state.dayStock.products : []).map(p => p.name.toUpperCase()));
      const availableToAssign = masterList.filter(mp => !currentAssignedNames.has(mp.name.toUpperCase()));

      if (availableToAssign.length === 0) {
        alert(`All ${masterList.length} master products are already assigned to ${state.currentDistrict}!`);
        return;
      }

      // Prompt user to pick from master list
      const menuText = availableToAssign.map((p, idx) => `${idx + 1}. ${p.name} (Schemes: ${p.schemes ? p.schemes.length : 1})`).join('\n');
      const choiceStr = prompt(`Select Master Product to assign to ${state.currentDistrict} (Enter Number 1-${availableToAssign.length}):\n\n${menuText}`);
      if (!choiceStr) return;

      const choiceIdx = parseInt(choiceStr, 10) - 1;
      if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= availableToAssign.length) {
        alert('Invalid selection. Please choose a valid number from the master list.');
        return;
      }

      const selectedMaster = availableToAssign[choiceIdx];
      const stockStr = prompt(`Enter initial allocated stock quantity for "${selectedMaster.name}" in ${state.currentDistrict}:`, '10');
      if (stockStr === null) return;
      const initialStock = parseFloat(stockStr) || 0;

      const res = await API.assignDistrictProductFromMaster(state.currentDistrict, selectedMaster.id, initialStock);
      showToast(res.message, 'success');
      await loadDistrictData();
    } catch (err) {
      showToast('Failed to assign product: ' + err.message, 'error');
    }
  };

  window.promptAdminDeleteDistrictProduct = async (productId, prodName) => {
    if (!confirm(`Are you sure you want to completely remove "${prodName}" from ${state.currentDistrict}?\n\nThis will remove it from the stock register and scheme selector for this district.`)) return;

    try {
      const res = await API.deleteDistrictProduct(state.currentDistrict, productId);
      showToast(res.message, 'info');
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  window.promptAdminCashPayment = async () => {
    const amtStr = prompt(`Enter cash amount collected from ${state.currentDistrict} dealer on ${state.currentDate} (₹):`);
    if (!amtStr) return;
    const amount = parseFloat(amtStr);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid positive cash amount');
      return;
    }
    const paymentMode = prompt('Payment mode (Cash Deposit / Bank Transfer / UPI / Cheque):', 'Cash Deposit');
    const note = prompt('Optional payment receipt note:', 'Admin collected cash payment');

    try {
      const res = await API.recordAdminPayment({
        district: state.currentDistrict,
        date: state.currentDate,
        amount,
        paymentMode,
        note
      });
      showToast(res.message, 'success');
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptAdminEditStock = async (productId, prodName, currentStock) => {
    const stockStr = prompt(`Set total base allocated opening stock for "${prodName}" in ${state.currentDistrict}:\n\n(Once edited, this stock quantity is permanently locked and will never automatically reset)`, currentStock !== undefined ? currentStock : 0);
    if (stockStr === null) return;
    const newStock = parseFloat(stockStr);
    if (isNaN(newStock) || newStock < 0) {
      alert('Please enter a valid stock number (0 or greater)');
      return;
    }

    try {
      const res = await API.adjustBaseStock(state.currentDistrict, productId, newStock);
      showToast(res.message || `Stock set to ${newStock} for "${prodName}" (Locked)`, 'success');
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptAdminMilaInward = async (productId, prodName, currentMila) => {
    const milaStr = prompt(`Enter Mila (Inward Received) quantity for ${prodName} on ${state.currentDate}:`, currentMila || 0);
    if (milaStr === null) return;
    const milaQty = parseFloat(milaStr) || 0;

    try {
      const res = await API.updateMilaInward(state.currentDistrict, state.currentDate, productId, milaQty);
      showToast(res.message, 'success');
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptAdminInwardNotes = async () => {
    const current = (state.dayStock && state.dayStock.inwardNote) || '';
    const note = prompt(`Enter Inward Mila text notes for ${state.currentDate} (e.g. DMD 4 TSO 2 US 2 KD 4):`, current);
    if (note === null) return;

    try {
      const res = await API.updateInwardNotes(state.currentDistrict, state.currentDate, note);
      showToast('Inward notes updated', 'success');
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptAdminDeleteDistrictProduct = async (productId, prodName) => {
    if (!confirm(`⚠️ Are you sure you want to PERMANENTLY REMOVE "${prodName}" from ${state.currentDistrict}?\n\nOnce deleted, this product will NOT be added back automatically.`)) return;

    try {
      const res = await API.deleteDistrictProduct(state.currentDistrict, productId);
      showToast(res.message || `Removed "${prodName}" from ${state.currentDistrict}`, 'success');
      await loadDistrictData();
    } catch (err) {
      showToast('Failed to remove product: ' + err.message, 'error');
    }
  };

  window.returnToDistrictDashboard = () => {
    state.currentView = 'district';
    renderAdminDistrictStrip();
    loadDistrictData();
  };

  // ================= ADMIN CONSOLE =================
  async function renderAdminConsole() {
    state.currentView = 'admin';
    const main = $('mainContent');
    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;background:#FAFBF6;border:1px solid var(--line);border-radius:10px;padding:12px 18px;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <button class="btn btn-secondary" onclick="returnToDistrictDashboard()" style="font-weight:700;padding:7px 16px;">
            ← Back to Daily Sales Register
          </button>
          <span style="font-size:16px;font-weight:700;color:var(--forest-deep);">⚙️ Administrator Control Center</span>
        </div>
        <div style="font-size:12.5px;color:var(--ink-soft);">
          Viewing Date: <span class="mono" style="font-weight:700;color:var(--ink);">${state.currentDate}</span> • Signed In: <strong>${escapeHtml(state.user.name || state.user.username)}</strong>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="admin-nav">
          <button class="admin-tab ${state.adminTab === 'matrix' ? 'active' : ''}" onclick="switchAdminTab('matrix')">📊 12-District Matrix</button>
          <button class="admin-tab ${state.adminTab === 'district-products' ? 'active' : ''}" onclick="switchAdminTab('district-products')">📋 District Products &amp; Stock</button>
          <button class="admin-tab ${state.adminTab === 'dispatch' ? 'active' : ''}" onclick="switchAdminTab('dispatch')">🚚 Stock Dispatch &amp; In-Transit</button>
          <button class="admin-tab ${state.adminTab === 'sheets' ? 'active' : ''}" onclick="switchAdminTab('sheets')">📈 Google Sheets Database</button>
          <button class="admin-tab ${state.adminTab === 'schemes' ? 'active' : ''}" onclick="switchAdminTab('schemes')">📦 Master Product &amp; Prices</button>
          <button class="admin-tab ${state.adminTab === 'dc' ? 'active' : ''}" onclick="switchAdminTab('dc')">🚚 District DC Settings</button>
          <button class="admin-tab ${state.adminTab === 'activity' ? 'active' : ''}" onclick="switchAdminTab('activity')">⚡ Live Activity Monitor</button>
          <button class="admin-tab ${state.adminTab === 'dealers' ? 'active' : ''}" onclick="switchAdminTab('dealers')">👥 Dealer Accounts</button>
        </div>
        <div id="adminTabContent" style="padding:16px;"></div>
      </div>
    `;

    if (state.adminTab === 'matrix') {
      await loadAdminMatrix();
    } else if (state.adminTab === 'district-products') {
      await loadAdminDistrictProducts();
    } else if (state.adminTab === 'dispatch') {
      await loadAdminDispatch();
    } else if (state.adminTab === 'sheets') {
      await loadAdminSheets();
    } else if (state.adminTab === 'schemes') {
      await loadAdminSchemes();
    } else if (state.adminTab === 'dc') {
      await loadAdminDcSettings();
    } else if (state.adminTab === 'activity') {
      await loadAdminActivityLogs();
    } else if (state.adminTab === 'dealers') {
      await loadAdminDealers();
    }
  }

  window.switchAdminTab = (tab) => {
    state.adminTab = tab;
    renderAdminConsole();
  };

  async function loadAdminMatrix() {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:30px;text-align:center;">Loading 12-District Overview...</div>';

    try {
      const res = await API.getAdminOverview(state.currentDate);
      state.adminOverviewData = res;

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <h3 style="margin:0;font-size:17px;">Consolidated 12-District Overview — <span class="mono">${state.currentDate}</span></h3>
            <span style="font-size:12px;color:var(--ink-soft);">${res.totals.districtsActive} of 12 districts active today</span>
          </div>
          <button class="btn btn-secondary" onclick="exportAdminOverviewCsv()">📥 Export Consolidated CSV</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>District</th>
                <th style="text-align:right;">Products Moved</th>
                <th style="text-align:right;">Total Qty</th>
                <th style="text-align:right;">Sale Qty</th>
                <th style="text-align:right;">Transfer Qty</th>
                <th style="text-align:right;">Final Total</th>
                <th style="text-align:right;">Sales Value (₹)</th>
                <th style="text-align:right;">DC Deductions (₹)</th>
                <th style="text-align:right;">Cash Deposited (₹)</th>
                <th style="text-align:right;">Ledger Balance (₹)</th>
                <th style="text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody id="adminOverviewMatrixBody">
      `;

      res.overview.forEach(row => {
        html += `
          <tr style="${row.hasActivity ? 'background:#FAFBF6;' : ''}">
            <td class="prod-name">
              <strong>${escapeHtml(row.district)}</strong>
              ${row.hasActivity ? '<span class="type-pill Opening" style="font-size:9px;">Active</span>' : ''}
            </td>
            <td style="text-align:right;" class="mono">${row.productsMoved}</td>
            <td style="text-align:right;" class="tot">${fmt(row.sumQty)}</td>
            <td style="text-align:right;" class="mono">${fmt(row.sumSale)}</td>
            <td style="text-align:right;" class="mono">${fmt(row.sumTransfer)}</td>
            <td style="text-align:right;" class="tot">${fmt(row.sumFinal)}</td>
            <td style="text-align:right;" class="tot">₹${fmt(row.totalSaleValue)}</td>
            <td style="text-align:right;" class="mono amt neg">₹${fmt(row.dcTotalDeducted)}</td>
            <td style="text-align:right;" class="mono amt pos">₹${fmt(row.cashDeposited)}</td>
            <td style="text-align:right;" class="tot ${row.ledgerBalance < 0 ? 'amt neg' : ''}">₹${fmt(row.ledgerBalance)}</td>
            <td style="text-align:center;">
              <button class="btn btn-secondary btn-sm" onclick="drillDownDistrict('${escapeHtml(row.district)}')">Open District</button>
            </td>
          </tr>
        `;
      });

      const t = res.totals;
      html += `
            </tbody>
            <tfoot>
              <tr>
                <td>ALL DISTRICTS TOTAL</td>
                <td style="text-align:right;">${t.totalProductsMoved}</td>
                <td style="text-align:right;">${fmt(t.totalQty)}</td>
                <td style="text-align:right;">${fmt(t.totalSale)}</td>
                <td style="text-align:right;">${fmt(t.totalTransfer)}</td>
                <td style="text-align:right;">${fmt(t.totalFinal)}</td>
                <td style="text-align:right;">₹${fmt(t.totalSaleValue)}</td>
                <td style="text-align:right;" class="amt neg">₹${fmt(t.totalDCDeductions)}</td>
                <td style="text-align:right;" class="amt pos">₹${fmt(t.totalCashDeposited)}</td>
                <td style="text-align:right;">₹${fmt(t.totalLedgerBalance)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load overview: ${err.message}</div>`;
    }
  }

  window.drillDownDistrict = (dist) => {
    state.currentDistrict = dist;
    renderAdminDistrictStrip();
    loadDistrictData();
  };

  // ================= DISTRICT PRODUCTS & STOCK MANAGER TAB =================
  let currentAdminDistrict = null;

  async function loadAdminDistrictProducts(selectedDistrict) {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:30px;text-align:center;">Loading District Products &amp; Stock Matrix...</div>';

    try {
      let districts = [];
      try {
        const dRes = await API.getDistrictsList();
        districts = (dRes.districts || []).filter(d => !['rewari', 'shamli'].includes(d.toLowerCase()));
      } catch (e) {
        districts = ['Chittorgarh', 'Alwar', 'Bikaner', 'Uttarakhand', 'Udham Singh Nagar', 'Faridabad', 'Gurgaon', 'Muzaffarnagar', 'Saharanpur', 'Jodhpur', 'Kota'];
      }

      if (!districts || districts.length === 0) {
        districts = ['Chittorgarh', 'Alwar', 'Bikaner', 'Uttarakhand', 'Udham Singh Nagar', 'Faridabad', 'Gurgaon', 'Muzaffarnagar', 'Saharanpur', 'Jodhpur', 'Kota'];
      }

      if (selectedDistrict) {
        currentAdminDistrict = selectedDistrict;
      } else if (!currentAdminDistrict || !districts.includes(currentAdminDistrict)) {
        currentAdminDistrict = state.currentDistrict && districts.includes(state.currentDistrict) ? state.currentDistrict : districts[0];
      }

      const data = await API.getDistrictMatrix(currentAdminDistrict);
      const matrix = data.matrix || [];
      const assignedCount = data.assignedCount !== undefined ? data.assignedCount : matrix.filter(p => p.isAssigned).length;
      const totalMaster = data.totalMaster || matrix.length;

      let html = `
        <div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
            <div>
              <h3 style="margin:0;font-size:17px;display:flex;align-items:center;gap:8px;">
                <span>📋 District Product Assignment &amp; Stock Manager</span>
              </h3>
              <span style="font-size:12px;color:var(--ink-soft);">
                Tick/Untick products to assign/unassign for each district. Edit base allocated stock directly — once edited, stock is permanently preserved and locked.
              </span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="promptCreateMasterProduct()" style="font-weight:700;">
                ➕ Create New Product
              </button>
              <button class="btn btn-secondary btn-sm" onclick="bulkToggleDistrictProducts('${escapeHtml(currentAdminDistrict)}', true)">
                ✅ Tick All (${totalMaster})
              </button>
              <button class="btn btn-secondary btn-sm" onclick="bulkToggleDistrictProducts('${escapeHtml(currentAdminDistrict)}', false)">
                ❌ Untick All
              </button>
              <button class="btn btn-primary btn-sm" onclick="saveAllDistrictProductAssignments('${escapeHtml(currentAdminDistrict)}')" style="font-weight:700;">
                💾 Save All Changes
              </button>
            </div>
          </div>

          <!-- District Selector Pills -->
          <div style="background:#FAFBF6;border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:16px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;">
              Select District to Manage:
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${districts.map(d => `
                <button 
                  class="btn ${d === currentAdminDistrict ? 'btn-primary' : 'btn-secondary'} btn-sm" 
                  style="border-radius:20px;font-size:12.5px;padding:5px 14px;${d === currentAdminDistrict ? 'box-shadow:0 2px 6px rgba(0,0,0,0.15);font-weight:700;' : ''}"
                  onclick="loadAdminDistrictProducts('${escapeHtml(d)}')"
                >
                  ${d === currentAdminDistrict ? '📍 ' : ''}${escapeHtml(d)}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Selected District Summary Strip -->
          <div style="background:#FFF9D2;border:1px solid #E6D57E;border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <span style="font-size:14px;font-weight:700;color:#745B00;">
                📍 Active District: <span style="font-size:15px;color:var(--ink);">${escapeHtml(currentAdminDistrict)}</span>
              </span>
              <span style="margin-left:12px;background:#fff;padding:3px 10px;border-radius:12px;border:1px solid #E6D57E;font-size:12px;font-weight:700;color:#745B00;">
                ${assignedCount} of ${totalMaster} Products Assigned
              </span>
            </div>
            <div style="font-size:12px;color:#8E6526;">
              💡 <em>Tick checkbox to assign. Type in stock quantity and click 💾 to lock base stock.</em>
            </div>
          </div>

          <!-- Interactive Products Table -->
          <div class="table-wrap">
            <table>
              <thead>
                <tr class="excel-head-yellow">
                  <th style="width:120px;text-align:center;">ASSIGN (TICK)</th>
                  <th style="width:30px;">#</th>
                  <th>MASTER PRODUCT NAME</th>
                  <th style="width:140px;text-align:center;">CLASSIFICATION</th>
                  <th style="text-align:right;width:180px;">BASE ALLOCATED STOCK</th>
                  <th style="text-align:right;width:120px;">LIVE STOCK</th>
                  <th style="text-align:center;width:110px;">STATUS</th>
                </tr>
              </thead>
              <tbody>
                ${matrix.map((p, idx) => `
                  <tr id="row_${p.masterId}" style="${p.isAssigned ? 'background:#FAFBF6;' : 'opacity:0.75;'}">
                    <td style="text-align:center;">
                      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:700;font-size:12px;">
                        <input 
                          type="checkbox" 
                          id="chk_${p.masterId}" 
                          class="district-prod-chk" 
                          data-prod-id="${p.masterId}" 
                          data-prod-name="${escapeHtml(p.name)}" 
                          ${p.isAssigned ? 'checked' : ''} 
                          style="width:18px;height:18px;cursor:pointer;"
                          onchange="onToggleDistrictProductCheck('${escapeHtml(currentAdminDistrict)}', '${p.masterId}', this.checked)"
                        >
                        <span id="chk_label_${p.masterId}" style="color:${p.isAssigned ? 'var(--good)' : 'var(--ink-soft)'};">
                          ${p.isAssigned ? '✓ Assigned' : '○ Off'}
                        </span>
                      </label>
                    </td>
                    <td class="mono" style="font-size:11px;color:var(--ink-soft);">${idx + 1}</td>
                    <td class="prod-name">
                      <strong style="font-size:13.5px;">${escapeHtml(p.name)}</strong>
                      <span style="font-size:11px;color:var(--ink-soft);display:block;">
                        Master Base Price: ₹${fmt(p.defaultPrice)}
                      </span>
                    </td>
                    <td style="text-align:center;">
                      ${p.isSpecial ? `
                        <span style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;padding:2px 7px;border-radius:4px;font-size:10.5px;font-weight:700;">
                          ⭐ SPECIAL
                        </span>
                      ` : `
                        <span style="background:#F1F5F9;color:#64748B;border:1px solid #CBD5E1;padding:2px 7px;border-radius:4px;font-size:10.5px;font-weight:600;">
                          STANDARD
                        </span>
                      `}
                    </td>
                    <td style="text-align:right;">
                      <div style="display:inline-flex;align-items:center;gap:6px;">
                        <input 
                          type="number" 
                          min="0" 
                          step="0.1" 
                          id="stock_${p.masterId}" 
                          class="mono input-field district-stock-input" 
                          style="width:90px;text-align:right;padding:4px 8px;font-size:13px;font-weight:700;background:#fff;" 
                          value="${p.stockAllocated}" 
                          ${!p.isAssigned ? 'disabled' : ''}
                          onchange="onDistrictStockInputChange('${escapeHtml(currentAdminDistrict)}', '${p.masterId}', this.value)"
                        >
                        <button 
                          class="btn btn-secondary btn-sm" 
                          style="padding:3px 7px;font-size:11px;" 
                          onclick="saveSingleDistrictStock('${escapeHtml(currentAdminDistrict)}', '${p.masterId}')" 
                          title="Save & Lock Stock for this product"
                          ${!p.isAssigned ? 'disabled' : ''}
                        >
                          💾
                        </button>
                      </div>
                    </td>
                    <td style="text-align:right;" class="mono tot">
                      ${p.isAssigned ? `${fmt(p.currentStock)}` : '—'}
                    </td>
                    <td style="text-align:center;">
                      ${p.isAssigned ? `
                        <span class="stock-pill in-stock" style="font-size:10px;">🟢 Active</span>
                      ` : `
                        <span class="stock-pill out-stock" style="font-size:10px;background:#F1F5F9;color:#64748B;border-color:#CBD5E1;">⚪ Unassigned</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load district products matrix: ${err.message}</div>`;
    }
  }

  window.loadAdminDistrictProducts = loadAdminDistrictProducts;

  window.onToggleDistrictProductCheck = async (district, masterId, isChecked) => {
    const label = $(`chk_label_${masterId}`);
    const stockInput = $(`stock_${masterId}`);
    const row = $(`row_${masterId}`);

    if (label) {
      label.textContent = isChecked ? '✓ Assigned' : '○ Off';
      label.style.color = isChecked ? 'var(--good)' : 'var(--ink-soft)';
    }
    if (stockInput) {
      stockInput.disabled = !isChecked;
    }
    if (row) {
      row.style.background = isChecked ? '#FAFBF6' : '#FFF';
      row.style.opacity = isChecked ? '1' : '0.75';
    }

    const stockVal = stockInput ? (parseFloat(stockInput.value) || 0) : 0;

    try {
      const res = await API.toggleDistrictProduct(district, masterId, isChecked, stockVal);
      showToast(res.message, isChecked ? 'success' : 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.onDistrictStockInputChange = async (district, masterId, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      showToast('Please enter a valid stock quantity (0 or greater)', 'error');
      return;
    }
    try {
      const res = await API.adjustBaseStock(district, masterId, num);
      showToast(`Stock updated to ${num} for ${district} (Locked & Preserved)`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.saveSingleDistrictStock = async (district, masterId) => {
    const input = $(`stock_${masterId}`);
    if (!input) return;
    const num = parseFloat(input.value);
    if (isNaN(num) || num < 0) {
      showToast('Please enter a valid positive stock number', 'error');
      return;
    }
    try {
      const res = await API.adjustBaseStock(district, masterId, num);
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.bulkToggleDistrictProducts = async (district, assignAll) => {
    const checkboxes = document.querySelectorAll('.district-prod-chk');
    const assignments = [];

    checkboxes.forEach(chk => {
      chk.checked = assignAll;
      const pid = chk.getAttribute('data-prod-id');
      const stockInp = $(`stock_${pid}`);
      if (stockInp) stockInp.disabled = !assignAll;
      const label = $(`chk_label_${pid}`);
      if (label) {
        label.textContent = assignAll ? '✓ Assigned' : '○ Off';
        label.style.color = assignAll ? 'var(--good)' : 'var(--ink-soft)';
      }
      const stockVal = stockInp ? (parseFloat(stockInp.value) || 0) : 0;
      assignments.push({
        productId: pid,
        isAssigned: assignAll,
        stockAllocated: stockVal
      });
    });

    try {
      const res = await API.bulkAssignDistrictProducts(district, assignments);
      showToast(res.message, 'success');
      loadAdminDistrictProducts(district);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.saveAllDistrictProductAssignments = async (district) => {
    const checkboxes = document.querySelectorAll('.district-prod-chk');
    const assignments = [];

    checkboxes.forEach(chk => {
      const pid = chk.getAttribute('data-prod-id');
      const stockInp = $(`stock_${pid}`);
      const stockVal = stockInp ? (parseFloat(stockInp.value) || 0) : 0;
      assignments.push({
        productId: pid,
        isAssigned: chk.checked,
        stockAllocated: stockVal
      });
    });

    try {
      const res = await API.bulkAssignDistrictProducts(district, assignments);
      showToast(res.message, 'success');
      loadAdminDistrictProducts(district);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  async function loadAdminSheets() {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:20px;">Loading Google Sheets Database Connection...</div>';

    try {
      const configRes = await API.getSheetsConfig();
      const scriptRes = await API.getSheetsScriptTemplate();
      const cfg = configRes.config || {};

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <h3 style="margin:0;font-size:16px;">📈 Google Sheets Database Integration</h3>
            <span style="font-size:12px;color:var(--ink-soft);">
              Live automatic data sync: every district sale, stock report, customer mobile, and daily cash closing.
            </span>
          </div>
          <div style="display:flex;gap:8px;">
            <a href="${configRes.sheetUrl}" target="_blank" class="btn btn-secondary">🔗 Open Google Sheet</a>
            <button class="btn btn-primary" onclick="syncAllGoogleSheetsNow()">🔄 Sync All 12 Districts Now</button>
          </div>
        </div>

        <!-- Connection Status Card -->
        <div style="background:var(--paper-light);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;">
            <div>
              <span style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;font-weight:700;">Google Spreadsheet ID</span>
              <div class="mono" style="font-size:13px;font-weight:600;margin-top:4px;word-break:break-all;">${configRes.sheetId}</div>
            </div>
            <div>
              <span style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;font-weight:700;">Status</span>
              <div style="margin-top:4px;">
                <span class="stock-pill in-stock">🟢 Connected &amp; Linked</span>
              </div>
            </div>
            <div>
              <span style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;font-weight:700;">Last Synced</span>
              <div style="font-size:13px;font-weight:600;margin-top:4px;color:var(--ink-strong);">
                ${cfg.lastSyncTimestamp ? new Date(cfg.lastSyncTimestamp).toLocaleString('en-IN') : 'Ready to Sync'}
              </div>
            </div>
          </div>

          <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

          <!-- Webhook URL Configuration -->
          <div>
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px;">
              Google Apps Script Web App Webhook URL (For Real-Time Automatic Push):
            </label>
            <div style="display:flex;gap:8px;">
              <input type="text" id="sheetsWebhookUrlInput" class="input-field" style="flex:1;" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(cfg.webhookUrl || '')}">
              <button class="btn btn-primary" onclick="saveGoogleWebhookUrl()">💾 Save Webhook URL</button>
            </div>
            <span style="font-size:11px;color:var(--ink-soft);display:block;margin-top:4px;">
              Paste your deployed Google Apps Script URL here so every sale is instantly written to your Google Sheet without clicking sync.
            </span>
          </div>
        </div>

        <!-- 3-Step Setup Guide with Apps Script -->
        <div style="background:#FFF9D2;border:1px solid #E6D57E;border-radius:8px;padding:16px;">
          <h4 style="margin:0 0 10px 0;font-size:14px;color:#745B00;">⚡ How to Connect Real-Time Sync in 1 Minute:</h4>
          <ol style="margin:0 0 14px 20px;padding:0;font-size:12.5px;line-height:1.7;color:#534100;">
            <li>Open your Google Sheet: <a href="${configRes.sheetUrl}" target="_blank" style="font-weight:600;color:#0056b3;">sale report spreadsheet</a></li>
            <li>Click <strong>Extensions &gt; Apps Script</strong> at the top menu of your Google Sheet.</li>
            <li>Replace all code in the script editor with the script below and click <strong>Save</strong> (💾).</li>
            <li>Click <strong>Deploy &gt; New deployment</strong> &rarr; Select type <strong>Web app</strong> &rarr; Set <i>Execute as:</i> <strong>Me</strong> and <i>Who has access:</i> <strong>Anyone</strong> &rarr; Click <strong>Deploy</strong>.</li>
            <li>Copy the <strong>Web App URL</strong> and paste it into the Webhook URL field above!</li>
          </ol>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:700;font-size:12px;color:#534100;">📄 Apps Script Code (Copy &amp; Paste in Google Sheet):</span>
            <button class="btn btn-secondary btn-sm" onclick="copySheetsScript()">📋 Copy Script Code</button>
          </div>
          <pre id="sheetsScriptPre" class="mono" style="background:#fff;border:1px solid #E6D57E;padding:12px;border-radius:6px;font-size:11px;max-height:240px;overflow:auto;user-select:all;">${escapeHtml(scriptRes.scriptCode)}</pre>
        </div>
      `;

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load Google Sheets config: ${err.message}</div>`;
    }
  }

  window.syncAllGoogleSheetsNow = async () => {
    try {
      showToast('Syncing all 12 districts to Google Sheets...', 'info');
      const res = await API.syncAllToSheets(state.currentDate);
      showToast('All 12 districts successfully synced to Google Sheets!', 'success');
      loadAdminSheets();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.saveGoogleWebhookUrl = async () => {
    const input = $('sheetsWebhookUrlInput');
    const webhookUrl = input ? input.value.trim() : '';

    try {
      const res = await API.updateSheetsConfig({ webhookUrl, autoSync: true });
      showToast(res.message, 'success');
      loadAdminSheets();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.copySheetsScript = () => {
    const pre = $('sheetsScriptPre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      showToast('Apps Script code copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Please select and copy the text manually.', 'info');
    });
  };

  async function loadAdminSchemes() {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:20px;">Loading Master Product Catalog...</div>';

    try {
      const res = await API.getMasterProducts();
      const products = res.products || [];

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <h3 style="margin:0;font-size:16px;">📦 Master Product Catalog</h3>
            <span style="font-size:12px;color:var(--ink-soft);">
              Manage company master products. Any product added here can be assigned to districts and sold with fully editable prices.
            </span>
          </div>
          <button class="btn btn-primary" onclick="promptCreateMasterProduct()">➕ Add New Master Product</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:28px;">#</th>
                <th>Master Product Name &amp; Classification</th>
                <th style="text-align:center;width:240px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${products.length === 0 ? `
                <tr><td colspan="3" style="text-align:center;padding:30px;color:var(--ink-soft);">No master products configured yet. Click "Add New Master Product" above.</td></tr>
              ` : products.map((p, idx) => `
                <tr>
                  <td class="mono" style="font-size:11px;color:var(--ink-soft);">${idx + 1}</td>
                  <td class="prod-name">
                    <strong style="font-size:14px;">${escapeHtml(p.name)}</strong>
                    ${p.isSpecial ? `
                      <span style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;margin-left:8px;">
                        ⭐ SPECIAL PRODUCT
                      </span>
                    ` : `
                      <span style="background:#F1F5F9;color:#64748B;border:1px solid #CBD5E1;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-left:8px;">
                        STANDARD PRODUCT
                      </span>
                    `}
                    <button class="btn-icon" onclick="promptRenameMasterProduct('${p.id}', '${escapeHtml(p.name)}')" title="Rename Product" style="font-size:11px;margin-left:6px;">✏️ Rename</button>
                  </td>
                  <td style="text-align:center;display:flex;gap:6px;justify-content:center;align-items:center;">
                    <button class="btn btn-secondary btn-sm" onclick="toggleMasterProductSpecial('${p.id}')" title="Click to toggle special product classification">
                      ${p.isSpecial ? '⭐ Unset Special' : '☆ Mark Special'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="promptDeleteMasterProduct('${p.id}', '${escapeHtml(p.name)}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load master catalog: ${err.message}</div>`;
    }
  }

  window.promptCreateMasterProduct = () => {
    const existing = document.getElementById('createMasterProductModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'createMasterProductModal';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:450px;background:#fff;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.25);overflow:hidden;">
        <div style="background:var(--forest-deep);color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:16px;color:#fff;">➕ Add New Master Product</h3>
          <button class="btn-icon" onclick="document.getElementById('createMasterProductModal').remove()" style="color:#fff;font-size:16px;border:none;background:none;cursor:pointer;">✕</button>
        </div>
        <div style="padding:20px;">
          <div style="margin-bottom:14px;">
            <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">1. Product Name *</label>
            <input type="text" id="newMasterProdName" class="input-lg" placeholder="e.g. PLAY MORE / DAMADAR" style="width:100%;text-transform:uppercase;padding:10px;border:1.5px solid var(--line);border-radius:6px;" required autofocus>
          </div>
          <div style="margin-bottom:14px;">
            <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">2. Default Base Scheme Price (₹)</label>
            <input type="number" id="newMasterProdPrice" class="input-lg mono" placeholder="2500" value="2500" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:6px;">
          </div>
          <div style="background:#FFFBEB;border:1.5px solid #FCD34D;border-radius:8px;padding:14px;margin-bottom:14px;">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0;">
              <input type="checkbox" id="newMasterProdSpecial" style="width:20px;height:20px;cursor:pointer;margin-top:2px;">
              <div>
                <strong style="color:#92400E;font-size:13.5px;">⭐ Special Product (Tick if Special)</strong>
                <div style="font-size:11.5px;color:#B45309;margin-top:2px;line-height:1.4;">
                  If ticked, this product will read as SPECIAL and use the SPECIAL PRODUCT DC rate (e.g. Flat ₹170 or ₹150) for the district.
                </div>
              </div>
            </label>
          </div>

          <div style="background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:8px;padding:14px;margin-bottom:18px;">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0;">
              <input type="checkbox" id="newMasterProdAutoAssign" checked style="width:20px;height:20px;cursor:pointer;margin-top:2px;">
              <div>
                <strong style="color:#166534;font-size:13.5px;">📍 Auto-Assign to Districts (0 Stock)</strong>
                <div style="font-size:11.5px;color:#15803D;margin-top:2px;line-height:1.4;">
                  Adds this product immediately to Chittorgarh, Alwar, Bikaner, Uttarakhand, and Udham Singh Nagar with 0 stock.
                </div>
              </div>
            </label>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('createMasterProductModal').remove()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="submitCreateMasterProductModal()" style="font-weight:700;">✓ Create &amp; Save Product</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.submitCreateMasterProductModal = async () => {
    const nameInput = document.getElementById('newMasterProdName');
    const priceInput = document.getElementById('newMasterProdPrice');
    const specialInput = document.getElementById('newMasterProdSpecial');
    const autoAssignInput = document.getElementById('newMasterProdAutoAssign');

    const name = (nameInput ? nameInput.value : '').trim();
    if (!name) {
      alert('Please enter a valid product name');
      return;
    }
    const defaultPrice = parseFloat(priceInput ? priceInput.value : '2500') || 2500;
    const isSpecial = specialInput ? specialInput.checked : false;
    const assignToAllZeroDistricts = autoAssignInput ? autoAssignInput.checked : false;

    try {
      const res = await API.createMasterProduct({
        name,
        defaultPrice,
        isSpecial,
        assignToAllZeroDistricts
      });
      showToast(res.message || `Created product "${name}"`, 'success');
      const m = document.getElementById('createMasterProductModal');
      if (m) m.remove();
      if (state.adminTab === 'schemes') await loadAdminSchemes();
      if (state.adminTab === 'district-products') await loadAdminDistrictProducts();
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.toggleMasterProductSpecial = async (productId) => {
    try {
      const res = await API.toggleMasterProductSpecial(productId);
      showToast(res.message, 'success');
      if (state.adminTab === 'schemes') await loadAdminSchemes();
      if (state.adminTab === 'district-products') await loadAdminDistrictProducts();
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptRenameMasterProduct = async (id, currentName) => {
    const newName = prompt(`Enter new name for product "${currentName}":`, currentName);
    if (!newName || !newName.trim() || newName.trim().toUpperCase() === currentName.toUpperCase()) return;

    try {
      const res = await API.renameMasterProduct(id, newName.trim());
      showToast(res.message, 'success');
      if (state.adminTab === 'schemes') await loadAdminSchemes();
      if (state.adminTab === 'district-products') await loadAdminDistrictProducts();
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptEditMasterProductPrice = async (id, prodName, oldPrice) => {
    const priceStr = prompt(`Enter new default price for "${prodName}" (₹):`, oldPrice);
    if (!priceStr) return;
    const newPrice = parseFloat(priceStr);
    if (isNaN(newPrice) || newPrice <= 0) return;

    try {
      const res = await API.renameMasterProduct(id, prodName, newPrice);
      showToast('Product price updated', 'success');
      if (state.adminTab === 'schemes') await loadAdminSchemes();
      if (state.adminTab === 'district-products') await loadAdminDistrictProducts();
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptDeleteMasterProduct = async (id, prodName) => {
    if (!confirm(`Are you sure you want to delete "${prodName}" from the Master Catalog?\n\nThis will permanently remove it from the catalog and all districts.`)) return;
    try {
      const res = await API.deleteMasterProduct(id);
      showToast(res.message || `Deleted "${prodName}" from Master Catalog`, 'info');
      if (state.adminTab === 'schemes') await loadAdminSchemes();
      if (state.adminTab === 'district-products') await loadAdminDistrictProducts();
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptDeleteDistrictProduct = async (productId, prodName) => {
    if (!confirm(`Are you sure you want to remove "${prodName}" from ${state.currentDistrict}?`)) return;
    try {
      const res = await API.deleteDistrictProduct(state.currentDistrict, productId);
      showToast(res.message || `Removed "${prodName}" from ${state.currentDistrict}`, 'info');
      if (state.adminTab === 'district-products') await loadAdminDistrictProducts();
      await loadDistrictData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  async function loadAdminActivityLogs() {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:20px;">Loading Activity Feed...</div>';

    try {
      const res = await API.getActivityLogs({ limit: 100 });
      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <h3 style="margin:0;">⚡ Live User &amp; Dealer Activity Monitor</h3>
            <span style="font-size:12px;color:var(--ink-soft);">Capturing logins, customer sales with mobile numbers, inward stock, and cash collections.</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="loadAdminActivityLogs()">🔄 Refresh</button>
        </div>

        <div class="activity-list">
          ${res.activityLogs.map(a => `
            <div class="activity-item">
              <span class="activity-badge ${a.action}">${escapeHtml(a.action)}</span>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;">
                  <strong>${escapeHtml(a.username)}</strong>
                  <span class="mono" style="font-size:11px;color:var(--ink-soft);">${new Date(a.timestamp).toLocaleString()}</span>
                </div>
                <div style="font-size:12.5px;color:var(--ink);margin-top:2px;">
                  ${escapeHtml(a.details)}
                </div>
                ${a.district ? `<span class="type-pill Other" style="margin-top:4px;display:inline-block;">📍 ${escapeHtml(a.district)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load activity logs: ${err.message}</div>`;
    }
  }

  async function loadAdminDealers() {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:30px;text-align:center;">Loading Districts &amp; Dealer Accounts...</div>';

    try {
      const res = await API.getDistricts();
      const list = res.districts || [];
      state.districts = list.map(d => d.name);

      let html = `
        <div style="display:grid;grid-template-columns:1fr;gap:20px;">
          <!-- 1. Add New District & Dealer Card -->
          <div class="card" style="border:2px solid var(--brass);background:#FAF7EE;padding:20px;border-radius:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
              <div>
                <h3 style="margin:0;font-size:17px;color:var(--brass-deep);">🏢 Add New District &amp; Dealer Account</h3>
                <span style="font-size:12.5px;color:var(--ink-soft);">Create a new district in the sales system, auto-allocate products &amp; generate a dealer login.</span>
              </div>
              <span class="scheme-pill-badge" style="font-size:12px;padding:4px 10px;background:#FFE873;color:#5C4B00;">
                📍 ${list.length} Active Districts
              </span>
            </div>

            <form onsubmit="submitAddNewDistrict(event)">
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:14px;">
                <div>
                  <label class="field-label">1. District Name *</label>
                  <input type="text" id="newDistName" class="input-lg" placeholder="e.g. Ajmer / Jaipur" required>
                </div>
                <div>
                  <label class="field-label">2. Dealer Full Name</label>
                  <input type="text" id="newDistDealerName" class="input-lg" placeholder="e.g. Ajmer Dealer">
                </div>
                <div>
                  <label class="field-label">3. Login Username *</label>
                  <input type="text" id="newDistUsername" class="input-lg mono" placeholder="e.g. dealer_ajmer" required>
                </div>
                <div>
                  <label class="field-label">4. Login Password *</label>
                  <input type="text" id="newDistPassword" class="input-lg mono" placeholder="e.g. dealer123" required>
                </div>
                <div>
                  <label class="field-label">5. Delivery Charge (DC ₹)</label>
                  <input type="number" id="newDistDcRate" class="input-lg mono" placeholder="200" value="200">
                </div>
              </div>

              <div style="display:flex;justify-content:flex-end;">
                <button type="submit" id="addDistBtn" class="btn-add-order" style="height:46px;padding:0 24px;font-size:14.5px;">
                  ➕ Create District &amp; Dealer Account
                </button>
              </div>
            </form>
          </div>

          <!-- 2. Active Districts & Dealer Accounts Table -->
          <div class="card">
            <div class="card-header excel-head-yellow" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:15px;">👥 ACTIVE DISTRICTS &amp; DEALER ACCOUNTS (${list.length})</h3>
              <span class="mono" style="font-size:12px;font-weight:700;">TOTAL: ${list.length} DISTRICTS</span>
            </div>

            <div class="table-wrap">
              <table>
                <thead class="excel-head-yellow">
                  <tr>
                    <th style="width:35px;">#</th>
                    <th>DISTRICT</th>
                    <th>DEALER NAME</th>
                    <th>LOGIN USERNAME</th>
                    <th>DELIVERY CHARGE (DC)</th>
                    <th>PRODUCTS</th>
                    <th style="text-align:center;width:240px;">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map((d, idx) => {
                    const u = d.dealer;
                    const dcDesc = d.dcRule ? (d.dcRule.type === 'flat' ? `Flat ₹${d.dcRule.value}` : `Tiered`) : 'Flat ₹200';
                    return `
                      <tr>
                        <td class="mono" style="font-size:11px;color:var(--ink-soft);">${idx + 1}</td>
                        <td class="prod-name"><strong>📍 ${escapeHtml(d.name)}</strong></td>
                        <td>${u ? escapeHtml(u.name) : '<em style="color:var(--ink-soft);">No dealer assigned</em>'}</td>
                        <td>
                          ${u ? `<code class="mono" style="background:#F0EDE1;padding:3px 8px;border-radius:4px;font-weight:700;color:var(--ink);">🔑 ${escapeHtml(u.username)}</code>` : '—'}
                        </td>
                        <td>
                          <span class="activity-badge STOCK_ADJUSTMENT" style="font-size:11px;">${escapeHtml(dcDesc)}</span>
                        </td>
                        <td class="mono">${d.productCount} products</td>
                        <td style="text-align:center;">
                          <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                            ${u ? `
                              <button class="btn btn-secondary btn-sm" onclick="promptEditDealerAccount('${u.id}', '${escapeHtml(u.username)}', '${escapeHtml(u.name)}', '${escapeHtml(d.name)}')" title="Edit Username, Name & Password">
                                ✏️ Edit Login
                              </button>
                              <button class="btn btn-secondary btn-sm" onclick="promptQuickResetPassword('${u.id}', '${escapeHtml(u.username)}')" title="Reset Password Only">
                                🔑 Reset Pass
                              </button>
                            ` : ''}
                            <button class="btn btn-danger btn-sm" onclick="promptDeleteDistrict('${escapeHtml(d.name)}')" title="Delete this district and its dealer">
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load Districts &amp; Dealers: ${err.message}</div>`;
    }
  }

  window.submitAddNewDistrict = async (e) => {
    e.preventDefault();
    const btn = $('addDistBtn');
    const district = ($('newDistName').value || '').trim();
    const name = ($('newDistDealerName').value || '').trim();
    const username = ($('newDistUsername').value || '').trim();
    const password = ($('newDistPassword').value || '').trim();
    const dcRate = parseFloat($('newDistDcRate').value) || 200;

    if (!district || !username || !password) {
      alert('District Name, Username, and Password are required.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating District...';
    }

    try {
      const res = await API.addDistrict(district, username, password, name, dcRate);
      showToast(res.message, 'success');
      await loadAdminDealers();
      renderAdminDistrictStrip();
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '➕ Create District & Dealer Account';
      }
    }
  };

  window.promptEditDealerAccount = async (userId, currentUsername, currentName, district) => {
    const newUsername = prompt(`Edit Dealer Login for ${district}:\n\nEnter New Username:`, currentUsername);
    if (newUsername === null) return;
    if (!newUsername.trim()) {
      alert('Username cannot be empty');
      return;
    }

    const newName = prompt(`Enter Dealer Full Name:`, currentName) || currentName;

    const newPassword = prompt(`Enter New Password for [${newUsername.trim()}] (leave blank to keep current password unchanged):`, '');
    if (newPassword === null) return;

    try {
      const res = await API.updateDealer(userId, newUsername.trim(), newPassword.trim() || undefined, newName.trim(), district);
      showToast(res.message, 'success');
      await loadAdminDealers();
    } catch (err) {
      showToast('Error updating dealer: ' + err.message, 'error');
    }
  };

  window.promptQuickResetPassword = async (userId, username) => {
    const newPass = prompt(`🔑 Quick Password Reset for [${username}]:\n\nEnter new password:`);
    if (!newPass) return;
    try {
      const res = await API.resetDealerPassword(userId, newPass.trim());
      showToast(res.message || `Password updated for ${username}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptDeleteDistrict = async (districtName) => {
    const confirmInput = prompt(`⚠️ CAUTION: You are about to DELETE district "${districtName}"!\n\nThis will remove the district and its dealer login access.\n\nTo confirm, type YES below:`);
    if (confirmInput !== 'YES') {
      if (confirmInput !== null) alert('Deletion cancelled: You did not type YES.');
      return;
    }

    try {
      const res = await API.deleteDistrict(districtName);
      showToast(res.message, 'warning');
      if (state.currentDistrict === districtName) {
        state.currentDistrict = 'Chittorgarh';
      }
      await loadAdminDealers();
      renderAdminDistrictStrip();
    } catch (err) {
      showToast('Error deleting district: ' + err.message, 'error');
    }
  };

  // ================= DISTRICT DC SETTINGS (TICK OPTIONS) =================
  async function loadAdminDcSettings() {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:20px;text-align:center;">Loading District DC configurations...</div>';

    try {
      const res = await API.getDcRules();
      const list = res.dcRules || [];
      const dcOptions = res.dcOptions || [];

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
          <div>
            <h3 style="margin:0;font-size:17px;color:var(--forest-deep);">🚚 District Delivery Charge (DC) Options</h3>
            <span style="font-size:12.5px;color:var(--ink-soft);line-height:1.4;display:block;margin-top:3px;">
              Select the exact DC rule option for each district below. Special products (marked ⭐ Special) will automatically receive their designated special DC rate.
            </span>
          </div>
          <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 14px;font-size:12px;color:#92400E;font-weight:600;">
            ⭐ Special Products: PLAY MORE, FOUJI, EYE SUTRA, ALERGY, HEIGHT VEDA, etc.
          </div>
        </div>

        <div style="display:grid;gap:16px;">
          ${list.map((d, idx) => {
            const activeOptId = d.optionId || (d.rule && d.rule.optionId) || 'opt_1';
            return `
              <div class="card" style="border:1.5px solid var(--line);border-radius:10px;padding:16px 18px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:8px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span class="mono" style="font-size:13px;font-weight:700;color:var(--ink-soft);background:#F1F5F9;padding:3px 8px;border-radius:6px;">#${idx + 1}</span>
                    <strong style="font-size:17px;color:var(--ink);text-transform:uppercase;letter-spacing:0.5px;">📍 ${escapeHtml(d.district)}</strong>
                  </div>
                  <div style="font-size:12.5px;background:#EFF6FF;color:#1E40AF;padding:4px 12px;border-radius:20px;border:1px solid #BFDBFE;font-weight:600;">
                    ✓ Active: ${escapeHtml(d.description)}
                  </div>
                </div>

                <!-- 7 DC Selectable Tick Options in Front of District -->
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(290px, 1fr));gap:10px;">
                  ${dcOptions.map(opt => {
                    const isChecked = activeOptId === opt.id;
                    return `
                      <label class="dc-option-tick-box ${isChecked ? 'active' : ''}" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:2px solid ${isChecked ? 'var(--brand)' : '#e2e8f0'};border-radius:8px;background:${isChecked ? '#F0FDF4' : '#FAFAFA'};cursor:pointer;transition:all 0.15s ease;">
                        <input type="radio" name="dc_option_${escapeHtml(d.district)}" value="${opt.id}" ${isChecked ? 'checked' : ''} onchange="setDistrictDcOption('${escapeHtml(d.district)}', '${opt.id}')" style="width:18px;height:18px;cursor:pointer;margin-top:2px;accent-color:var(--brand);">
                        <div style="flex:1;">
                          <div style="font-size:12px;font-weight:700;color:${isChecked ? '#166534' : '#1e293b'};line-height:1.35;">
                            ${opt.num}. ${escapeHtml(opt.label)}
                          </div>
                        </div>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load DC settings: ${err.message}</div>`;
    }
  }

  window.setDistrictDcOption = async (district, optionId) => {
    try {
      const res = await API.updateDistrictDc(district, null, optionId);
      showToast(res.message || `DC option updated for ${district}`, 'success');
      if (state.adminTab === 'dc') await loadAdminDcSettings();
      if (state.adminTab === 'dealers') await loadAdminDealers();
      if (state.currentDistrict === district) await loadDistrictData();
    } catch (err) {
      showToast('Failed to update DC option: ' + err.message, 'error');
    }
  };

  // ================= ADMIN STOCK DISPATCH & IN-TRANSIT SHIPMENTS =================
  async function loadAdminDispatch() {
    const container = $('adminTabContent');
    container.innerHTML = '<div style="padding:30px;text-align:center;">Loading Stock Dispatches...</div>';

    try {
      const [mastersRes, transfersRes] = await Promise.all([
        API.getMasterProducts(),
        API.getAllTransfersAdmin()
      ]);

      const products = mastersRes.products || [];
      state.dispatchMasterProducts = products;

      const pending = transfersRes.pendingTransfers || [];
      const accepted = transfersRes.acceptedTransfers || [];
      const declined = transfersRes.declinedTransfers || [];

      let html = `
        <div style="display:grid;grid-template-columns:1fr;gap:20px;">
          <!-- 1. Dispatch Multi-Product Stock Form -->
          <div class="card" style="border:2px solid var(--brass);background:#FAF7EE;padding:20px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.04);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
              <div>
                <h3 style="margin:0;font-size:17px;color:var(--brass-deep);">🚚 Dispatch Multi-Product Stock Consignment</h3>
                <span style="font-size:12.5px;color:var(--ink-soft);">Add multiple products and custom quantities in one single shipment/challan.</span>
              </div>
              <div id="dispatchSummaryBadge" class="scheme-pill-badge" style="font-size:12.5px;padding:4px 10px;background:#FFE873;color:#5C4B00;border:1px solid #E6D275;">
                📦 Consignment: 0 Products • 0 Units
              </div>
            </div>

            <form onsubmit="submitAdminDispatchStock(event)">
              <!-- Destination, Challan & Notes -->
              <div style="display:grid;grid-template-columns:1.5fr 1.5fr 2fr;gap:12px;margin-bottom:16px;">
                <div>
                  <label class="field-label">1. Destination District *</label>
                  <select id="dispatchDistrict" class="input-lg" required>
                    <option value="">-- Select Destination District --</option>
                    ${(state.districts || DISTRICTS).map(d => `<option value="${d}">${d}</option>`).join('')}
                  </select>
                </div>

                <div>
                  <label class="field-label">2. Challan / Bilty / Tracking #</label>
                  <input type="text" id="dispatchChallan" class="input-lg" placeholder="e.g. CH-9082 / VRL-4891">
                </div>

                <div>
                  <label class="field-label">3. Consignment Dispatch Note (Optional)</label>
                  <input type="text" id="dispatchNote" class="input-lg" placeholder="e.g. Sent via SafeExpress parcel">
                </div>
              </div>

              <!-- Product Item Rows -->
              <div style="background:#FFF;border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                  <strong style="font-size:13px;color:var(--ink-soft);text-transform:uppercase;">Products in this Consignment:</strong>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="addDispatchItemRow()" style="font-weight:700;">
                    ➕ Add Another Product
                  </button>
                </div>

                <div id="dispatchItemsContainer">
                  <div class="dispatch-item-row" id="drow_initial">
                    <div>
                      <select class="input-lg dispatch-prod-select" required onchange="updateDispatchSummary()">
                        <option value="">-- Select Product --</option>
                        ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                      </select>
                    </div>
                    <div>
                      <input type="number" class="input-lg mono dispatch-prod-qty" placeholder="Quantity" min="1" step="1" required style="font-weight:700;" oninput="updateDispatchSummary()">
                    </div>
                    <div>
                      <button type="button" class="btn btn-danger btn-sm" onclick="removeDispatchItemRow('drow_initial')" title="Remove Product">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div style="display:flex;justify-content:flex-end;">
                <button type="submit" id="dispatchBtn" class="btn-add-order" style="height:50px;padding:0 28px;font-size:15px;">
                  🚚 Dispatch Entire Consignment
                </button>
              </div>
            </form>
          </div>

          <!-- 2. Active In-Transit Shipments (Awaiting Dealer Receipt) -->
          <div class="card">
            <div class="card-header excel-head-yellow" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:15px;">🟡 ACTIVE IN-TRANSIT SHIPMENTS (PENDING DEALER RECEIPT)</h3>
              <span class="mono" style="font-weight:700;font-size:12px;">${pending.length} CONSIGNMENT(S) IN-TRANSIT</span>
            </div>

            <div class="table-wrap" style="max-height:380px;">
              <table>
                <thead class="excel-head-yellow">
                  <tr>
                    <th>CONSIGNMENT #</th>
                    <th>DESTINATION</th>
                    <th>PRODUCTS &amp; MANIFEST</th>
                    <th style="text-align:right;">TOTAL UNITS</th>
                    <th>CHALLAN / TRACKING</th>
                    <th>DISPATCHED AT</th>
                    <th>DISPATCHED BY</th>
                    <th style="text-align:center;">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  ${pending.length === 0 ? `
                    <tr><td colspan="8" style="padding:30px;text-align:center;color:var(--ink-soft);">No pending consignments in-transit. All dispatched stock has been received by dealers.</td></tr>
                  ` : pending.map(t => {
                    const hasItems = t.items && Array.isArray(t.items) && t.items.length > 0;
                    const totalUnits = t.totalUnits || t.qty;
                    const itemsHtml = hasItems ? `
                      <div class="incoming-item-chips">
                        ${t.items.map(it => `<span class="inward-item-badge"><strong>${escapeHtml(it.productName)}</strong>: <span class="mono" style="color:var(--good);font-weight:700;">+${it.qty}</span></span>`).join('')}
                      </div>
                    ` : `<strong>${escapeHtml(t.productName)}</strong>`;

                    return `
                      <tr>
                        <td class="mono"><strong>${escapeHtml(t.transferNo)}</strong></td>
                        <td><strong>📍 ${escapeHtml(t.district)}</strong></td>
                        <td class="prod-name">${itemsHtml}</td>
                        <td style="text-align:right;font-weight:700;color:var(--good);" class="mono">+${totalUnits} Units</td>
                        <td>${t.challanNo ? `<code>${escapeHtml(t.challanNo)}</code>` : '—'}</td>
                        <td class="mono" style="font-size:11px;color:var(--ink-soft);">${t.dispatchedAt.slice(0, 16).replace('T', ' ')}</td>
                        <td style="font-size:12px;">${escapeHtml(t.dispatchedBy)}</td>
                        <td style="text-align:center;">
                          <span class="type-pill Opening" style="background:#FFF8E6;color:#C07000;border:1px solid #F5DCA3;">🟡 In-Transit (Accept/Decline Pending)</span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- 3. Completed / Accepted Delivery History -->
          <div class="card">
            <div class="card-header" style="background:#FAF7EE;display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:15px;color:var(--ink);">✅ DELIVERED &amp; ACCEPTED STOCK HISTORY</h3>
              <span class="mono" style="font-size:12px;color:var(--ink-soft);">${accepted.length} completed consignments</span>
            </div>

            <div class="table-wrap" style="max-height:380px;">
              <table>
                <thead>
                  <tr>
                    <th>CONSIGNMENT #</th>
                    <th>DISTRICT</th>
                    <th>RECEIVED ITEMS</th>
                    <th style="text-align:right;">TOTAL UNITS</th>
                    <th>RECEIVED BY (DEALER)</th>
                    <th>RECEIVED DATE</th>
                    <th style="text-align:center;">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  ${accepted.length === 0 ? `
                    <tr><td colspan="7" style="padding:20px;text-align:center;color:var(--ink-soft);">No completed consignments yet.</td></tr>
                  ` : accepted.map(t => {
                    const hasItems = t.items && Array.isArray(t.items) && t.items.length > 0;
                    const totalUnits = t.totalUnits || t.qty;
                    const itemsHtml = hasItems ? `
                      <div class="incoming-item-chips">
                        ${t.items.map(it => `<span class="inward-item-badge"><strong>${escapeHtml(it.productName)}</strong>: <span class="mono" style="color:var(--good);font-weight:700;">+${it.qty}</span></span>`).join('')}
                      </div>
                    ` : `<strong>${escapeHtml(t.productName)}</strong>`;

                    return `
                      <tr>
                        <td class="mono">${escapeHtml(t.transferNo)}</td>
                        <td>📍 ${escapeHtml(t.district)}</td>
                        <td>${itemsHtml}</td>
                        <td style="text-align:right;font-weight:700;color:var(--good);" class="mono">+${totalUnits} Units</td>
                        <td>👤 ${escapeHtml(t.receivedBy || 'Dealer')}</td>
                        <td class="mono">${t.receivedDate || (t.receivedAt ? t.receivedAt.slice(0, 10) : '—')}</td>
                        <td style="text-align:center;">
                          <span class="type-pill Sale" style="background:#EAF4DE;color:var(--good);border:1px solid #C4DEB0;">✅ Accepted</span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- 4. Declined / Rejected Stock History -->
          ${declined.length > 0 ? `
            <div class="card" style="border:1px solid #F5C6CB;">
              <div class="card-header" style="background:#FDF0F2;display:flex;justify-content:space-between;align-items:center;">
                <h3 style="margin:0;font-size:15px;color:var(--danger);">🔴 DECLINED CONSIGNMENTS (REJECTED BY DEALERS)</h3>
                <span class="mono" style="font-size:12px;color:var(--danger);font-weight:700;">${declined.length} declined</span>
              </div>

              <div class="table-wrap" style="max-height:300px;">
                <table>
                  <thead>
                    <tr>
                      <th>CONSIGNMENT #</th>
                      <th>DISTRICT</th>
                      <th>DISPATCHED ITEMS</th>
                      <th style="text-align:right;">TOTAL UNITS</th>
                      <th>DECLINED BY</th>
                      <th>DECLINE REASON</th>
                      <th style="text-align:center;">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${declined.map(t => {
                      const totalUnits = t.totalUnits || t.qty;
                      return `
                        <tr>
                          <td class="mono">${escapeHtml(t.transferNo)}</td>
                          <td>📍 ${escapeHtml(t.district)}</td>
                          <td>${escapeHtml(t.productName)}</td>
                          <td style="text-align:right;font-weight:700;color:var(--danger);" class="mono">${totalUnits} Units</td>
                          <td>👤 ${escapeHtml(t.declinedBy || 'Dealer')}</td>
                          <td><em style="color:var(--danger); font-size:12.5px;">"${escapeHtml(t.declineReason || 'Declined')}"</em></td>
                          <td style="text-align:center;">
                            <span class="type-pill" style="background:#FDE8E8;color:var(--danger);border:1px solid #F8B4B4;">🔴 Declined</span>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        </div>
      `;

      container.innerHTML = html;
      updateDispatchSummary();
    } catch (err) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px;">Failed to load Stock Dispatch: ${err.message}</div>`;
    }
  }

  window.addDispatchItemRow = () => {
    const container = $('dispatchItemsContainer');
    if (!container || !state.dispatchMasterProducts) return;

    const rowId = 'drow_' + Date.now() + Math.random().toString(36).slice(2, 5);
    const div = document.createElement('div');
    div.className = 'dispatch-item-row';
    div.id = rowId;
    div.innerHTML = `
      <div>
        <select class="input-lg dispatch-prod-select" required onchange="updateDispatchSummary()">
          <option value="">-- Select Product --</option>
          ${state.dispatchMasterProducts.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <input type="number" class="input-lg mono dispatch-prod-qty" placeholder="Quantity" min="1" step="1" required style="font-weight:700;" oninput="updateDispatchSummary()">
      </div>
      <div>
        <button type="button" class="btn btn-danger btn-sm" onclick="removeDispatchItemRow('${rowId}')" title="Remove Product">
          ✕
        </button>
      </div>
    `;
    container.appendChild(div);
    updateDispatchSummary();
  };

  window.removeDispatchItemRow = (rowId) => {
    const row = $(rowId);
    if (row) {
      const container = $('dispatchItemsContainer');
      if (container && container.children.length > 1) {
        row.remove();
        updateDispatchSummary();
      } else {
        alert('Consignment must contain at least one product row');
      }
    }
  };

  window.updateDispatchSummary = () => {
    const rows = document.querySelectorAll('.dispatch-item-row');
    let totalItems = 0;
    let totalUnits = 0;

    rows.forEach(r => {
      const sel = r.querySelector('.dispatch-prod-select');
      const qtyInput = r.querySelector('.dispatch-prod-qty');
      const q = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
      if (sel && sel.value && q > 0) {
        totalItems++;
        totalUnits += q;
      }
    });

    const badge = $('dispatchSummaryBadge');
    if (badge) {
      badge.textContent = `📦 Consignment: ${totalItems} Product(s) • ${totalUnits} Total Units`;
    }
  };

  window.submitAdminDispatchStock = async (e) => {
    e.preventDefault();
    const btn = $('dispatchBtn');
    const district = $('dispatchDistrict').value;
    const challanNo = ($('dispatchChallan').value || '').trim();
    const note = ($('dispatchNote').value || '').trim();

    if (!district) {
      alert('Please select a destination district');
      return;
    }

    const rows = document.querySelectorAll('.dispatch-item-row');
    const items = [];

    rows.forEach(r => {
      const sel = r.querySelector('.dispatch-prod-select');
      const qtyInput = r.querySelector('.dispatch-prod-qty');
      const pid = sel ? sel.value : '';
      const q = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
      if (pid && q > 0) {
        items.push({ productId: pid, qty: q });
      }
    });

    if (items.length === 0) {
      alert('Please add at least one product and specify quantity > 0');
      return;
    }

    const totalUnits = items.reduce((sum, it) => sum + it.qty, 0);

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Dispatching Consignment...';
    }

    try {
      const res = await API.dispatchStock(district, items, challanNo, note);
      showToast(res.message || `Dispatched ${items.length} products (${totalUnits} units) to ${district}`, 'success');
      await loadAdminDispatch();
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚚 Dispatch Entire Consignment';
      }
    }
  };

  window.dealerAcceptStockTransfer = async (transferId, transferNo, totalUnits) => {
    if (!confirm(`Confirm Receipt of Stock Consignment?\n\nConsignment Ref: ${transferNo}\nTotal Quantity: +${totalUnits} Units\n\nThis will add all products and quantities directly into ${state.currentDistrict}'s stock register.`)) return;

    try {
      const res = await API.acceptStockTransfer(transferId, state.currentDate);
      showToast(res.message, 'success');
      await loadDistrictData();
    } catch (err) {
      showToast('Error accepting consignment: ' + err.message, 'error');
    }
  };

  window.dealerDeclineStockTransfer = async (transferId, transferNo) => {
    const reason = prompt(`Decline Stock Consignment [${transferNo}]?\n\nPlease enter the reason for declining (e.g. parcel damaged, wrong district, quantity mismatch):`, 'Parcel damaged in transit');
    if (reason === null) return; // User canceled prompt

    try {
      const res = await API.declineStockTransfer(transferId, reason);
      showToast(res.message, 'warning');
      await loadDistrictData();
    } catch (err) {
      showToast('Error declining consignment: ' + err.message, 'error');
    }
  };

  // Switch Cash Detail Sub-tab
  window.switchCashDetailTab = (tab) => {
    state.cashDetailTab = tab;
    renderExcelDashboard();
  };

  // Export Detailed Cash Statement CSV
  window.exportDetailedCashStatementCsv = () => {
    const full = state.districtFullCash;
    if (!full || !full.dailyLedger) return;

    let csv = `DETAILED CASH STATEMENT & LEDGER - ${state.currentDistrict}\n\n`;
    csv += `Current Net Cash Balance,₹${full.totals.currentBalance || 0}\n`;
    csv += `Lifetime Total Sales Collected,₹${full.totals.totalSalesLifetime || 0}\n`;
    csv += `Lifetime Total Cash Paid to Company,₹${full.totals.totalPaidLifetime || 0}\n\n`;

    csv += 'DAY-BY-DAY HISTORICAL CASH LEDGER\n';
    csv += 'DATE,OPENING CASH (OP),TODAY NET SALES,TOTAL ACCUMULATED,CASH PAID TO COMPANY,FINAL CLOSING CASH,ORDERS COUNT\n';
    full.dailyLedger.forEach(d => {
      csv += `${d.date},${d.opCash},${d.todaySalesNet},${d.totalAccumulated},-${d.adminCashPaid},${d.closingCash},${d.ordersCount}\n`;
    });

    csv += '\nITEMIZED EVERY CASH ENTRY & TRANSACTION\n';
    csv += 'DATE,TIME,ENTRY TYPE,TRANSACTION / TITLE,CUSTOMER MOBILE,CUSTOMER NAME,GROSS PRICE,DC DEDUCTED,NET CASH EFFECT,NOTES\n';
    full.allTransactions.forEach(t => {
      csv += `${t.date},"${t.time}","${t.type}","${t.title}","${t.customerMobile || ''}","${t.customerName || ''}",${t.grossPrice},${t.dcDeducted},${t.netAmount},"${t.note || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Cash_Statement_${state.currentDistrict}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export
  function exportExcelCsv() {
    if (!state.dayStock || !state.dayCash) return;
    let csv = `EXCEL SALES & STOCK REPORT - ${state.currentDistrict} - ${state.currentDate}\n\n`;
    csv += 'PRODUCT NAME,QUANTITY (OPENING),SALE,TOTAL (REMAIN),MILA (INWARD),TOTAL (CLOSING)\n';

    state.dayStock.products.forEach(p => {
      csv += `"${p.name}",${p.openingStock},${p.saleQty},${p.remainStock},${p.milaQty},${p.closingStock}\n`;
    });

    csv += `\nINWARD MILA NOTES,"${state.dayStock.inwardNote || ''}"\n\n`;

    csv += 'TODAY CUSTOMER ORDERS\n';
    csv += 'Order No,Product / Scheme,Price,DC,Net Total,Customer Mobile,Customer Name,Time\n';
    state.customerOrders.forEach(o => {
      csv += `"${o.orderNo}","${o.schemeName || o.productName}",${o.unitPrice},${o.dcRate},${o.netAmount || (o.unitPrice - o.dcRate)},"${o.customerMobile}","${o.customerName || ''}","${o.time || ''}"\n`;
    });

    const c = state.dayCash;
    csv += `\nCASH RECONCILIATION\n`;
    csv += `TODAY NET SALES,${c.todaySalesNet}\n`;
    csv += `OP (LAST DAY CLOSING CASH),${c.opCash}\n`;
    csv += `TOTAL CASH ACCUMULATED,${c.totalAccumulated}\n`;
    csv += `CASH PAID TO COMPANY (ADMIN ONLY),-${c.adminCashPaid}\n`;
    csv += `FINAL CLOSING CASH,${c.closingCash}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Sales_Report_${state.currentDistrict}_${state.currentDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.exportAdminOverviewCsv = () => {
    if (!state.adminOverviewData) return;
    let csv = `Consolidated 12-District Report - ${state.currentDate}\n\n`;
    csv += 'District,Products Moved,Total Qty,Sale Qty,Transfer Qty,Final Total,Sales Value (INR),DC Deductions (INR),Cash Deposited (INR),Ledger Balance (INR)\n';

    state.adminOverviewData.overview.forEach(r => {
      csv += `"${r.district}",${r.productsMoved},${r.sumQty},${r.sumSale},${r.sumTransfer},${r.sumFinal},${r.totalSaleValue},${r.dcTotalDeducted},${r.cashDeposited},${r.ledgerBalance}\n`;
    });

    const t = state.adminOverviewData.totals;
    csv += `\nCONSOLIDATED TOTALS,${t.totalProductsMoved},${t.totalQty},${t.totalSale},${t.totalTransfer},${t.totalFinal},${t.totalSaleValue},${t.totalDCDeductions},${t.totalCashDeposited},${t.totalLedgerBalance}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Consolidated_Report_${state.currentDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Start app on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
