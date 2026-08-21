# Sales Register Pro — Enterprise Edition

Secure, Multi-User Web Application for District Dealers and Central Administrators with automated Delivery Charge (DC) computation, ledger balancing, role isolation, and server-enforced same-day editing.

---

## 🔑 Default Credentials

### Administrator
- **Username**: `admin`
- **Password**: `admin123`
- **Access**: View and edit all 12 districts, 12-District Consolidated Matrix, global DC rules engine, product catalog manager, and dealer account management.

### District Dealers (12 Districts)
All dealer accounts share the default initial password `dealer123` (can be reset in Admin portal).

| District | Username | Default Password | DC Rule Applied |
| :--- | :--- | :--- | :--- |
| **Chittorgarh** | `dealer_chittorgarh` | `dealer123` | $\le ₹1500 \to ₹200$, $> ₹1500 \to ₹250$ |
| **Alwar** | `dealer_alwar` | `dealer123` | Flat ₹200 |
| **Bikaner** | `dealer_bikaner` | `dealer123` | $\le ₹1500 \to ₹250$, $> ₹1500 \to ₹270$ |
| **Uttarakhand** | `dealer_uttarakhand` | `dealer123` | Flat ₹200 (Special products ₹170: *Play More, Fouji, Height Sutra, Eye Sutra, Alergy*) |
| **Udham Singh Nagar** | `dealer_udhamsingh` | `dealer123` | $\le ₹1500 \to ₹200$, $> ₹1500 \to ₹250$ (Special products ₹170) |
| **Jodhpur** | `dealer_jodhpur` | `dealer123` | Configurable Flat Rate (Default ₹200) |
| **Kota** | `dealer_kota` | `dealer123` | $\le ₹1500 \to ₹200$, $> ₹1500 \to ₹250$ |
| **Faridabad** | `dealer_faridabad` | `dealer123` | Flat ₹250 |
| **Gurgaon** | `dealer_gurgaon` | `dealer123` | Flat ₹200 |
| **Rewari** | `dealer_rewari` | `dealer123` | Flat ₹250 |
| **Muzaffarnagar** | `dealer_muzaffarnagar` | `dealer123` | Configurable Flat Rate (Default ₹200) |
| **Shamli** | `dealer_shamli` | `dealer123` | Configurable Flat Rate (Default ₹200) |

---

## 🚀 How to Run the App

1. Open your terminal in the application folder:
   ```bash
   cd "C:\Users\RAVIP\.gemini\antigravity\scratch\sales-register-pro"
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser at:
   ```
   http://localhost:3000
   ```

---

## 🛡️ Security & Business Rules Implemented

1. **Same-Day Edit Lock for Dealers**:
   - Dealers can only edit and auto-save records for the **current server date (Today)**.
   - Dealers can freely browse past dates to audit their district's history, but all input fields and DC buttons are automatically locked into a **Read-Only Historical View**.
   - Any server requests attempting to bypass the client UI and edit historical data are strictly blocked with HTTP 403 Forbidden.

2. **District Data Isolation**:
   - Each dealer can only view and edit their own assigned district. Cross-district queries are forbidden.

3. **Automated DC Engine**:
   - When logging orders and delivery prices, the DC is computed automatically using the district's exact threshold, flat rate, or special product override rules.
   - Clicking **"Post DC to Ledger"** immediately posts the calculated DC expense with an auto-signed negative amount to the running ledger.

4. **Administrator Oversight**:
   - **All Districts Matrix**: Live daily summary across all 12 districts with products moved, total quantities, sales, transfers, final totals, DC deductions, cash deposits, and net balance.
   - **District Drill-Down**: Admin can open any district on any date.
   - **DC Rules Engine**: Admin can reconfigure thresholds, flat rates, and overrides globally.
   - **Product Catalog**: Admin can add new products, adjust unit prices, and reorganize items.
   - **CSV Export**: Export individual district registers or full 12-district consolidated reports.
