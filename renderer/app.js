/* ============================= */
/* GLOBAL STATE */
/* ============================= */
let cart = [];
let allProducts = [];
let editingProductId = null;
let isAddingUser = false;
let profitChart = null;

console.log("APP JS LOADED");

/* ============================= */
/* LOGIN */
/* ============================= */
async function login() {
  const username = document.getElementById("username")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!username || !password) {
    alert("Please enter username and password");
    return;
  }

  try {
    const user = await window.api.loginUser(username, password);

    if (!user || user.success === false) {
      alert("Login failed");
      return;
    }

    localStorage.setItem("role", user.role || "cashier");
    localStorage.setItem("cashier", username);

    window.location.replace("pos-select.html");
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    alert("Login error occurred");
  }
}

/* ============================= */
/* POS PRODUCTS */
/* ============================= */
async function loadProducts() {
  try {
    allProducts = await window.api.getProducts();
    renderProducts(allProducts);
  } catch (error) {
    console.error("loadProducts error:", error);
  }
}

function renderProducts(products) {
  const container = document.getElementById("products");
  if (!container) return;

  container.innerHTML = "";

  products.forEach((p) => {
    const div = document.createElement("div");
    div.className = "product";

    const lowStock =
      Number(p.stock) <= 5
        ? `<p style="color:red;font-size:12px">Low Stock (${p.stock})</p>`
        : "";

    div.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <p style="color:#1e88e5;font-weight:bold;font-size:18px">GHS ${Number(p.price || 0).toFixed(2)}</p>
      ${lowStock}
    `;

    div.onclick = () => addToCart(p);
    container.appendChild(div);
  });
}

function filterCategory(category) {
  if (category === "All") {
    renderProducts(allProducts);
    return;
  }

  const filtered = allProducts.filter(
    (p) => String(p.category || "").toLowerCase() === String(category).toLowerCase()
  );
  renderProducts(filtered);
}

function searchProducts() {
  const search = document.getElementById("searchProduct")?.value.toLowerCase() || "";

  const filtered = allProducts.filter((p) =>
    (p.name || "").toLowerCase().includes(search) ||
    String(p.barcode || "").toLowerCase().includes(search) ||
    (p.category || "").toLowerCase().includes(search)
  );

  renderProducts(filtered);
}

/* ============================= */
/* CART */
/* ============================= */
function addToCart(product) {
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    if (existing.qty < Number(product.stock)) {
      existing.qty++;
    } else {
      alert(`Not enough stock for ${product.name}`);
      return;
    }
  } else {
    if (Number(product.stock) <= 0) {
      alert(`${product.name} is out of stock`);
      return;
    }

    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      qty: 1
    });
  }

  renderCart();
}

function renderCart() {
  const table = document.getElementById("cart");
  if (!table) return;

  table.innerHTML = "";
  let total = 0;

  cart.forEach((item) => {
    const subtotal = Number(item.price) * Number(item.qty);
    total += subtotal;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>
        <button onclick="decreaseQty(${item.id})">-</button>
        ${item.qty}
        <button onclick="increaseQty(${item.id})">+</button>
      </td>
      <td>GHS ${subtotal.toFixed(2)}</td>
      <td><button onclick="removeItem(${item.id})">Remove</button></td>
    `;

    table.appendChild(tr);
  });

  const totalEl = document.getElementById("total");
  if (totalEl) totalEl.innerText = total.toFixed(2);
}

function increaseQty(id) {
  const item = cart.find((i) => i.id === id);
  const product = allProducts.find((p) => p.id === id);

  if (!item || !product) return;

  if (item.qty >= Number(product.stock)) {
    alert(`Not enough stock for ${product.name}`);
    return;
  }

  item.qty++;
  renderCart();
}

function decreaseQty(id) {
  const item = cart.find((i) => i.id === id);
  if (!item) return;

  if (item.qty > 1) {
    item.qty--;
  } else {
    removeItem(id);
    return;
  }

  renderCart();
}

function removeItem(id) {
  cart = cart.filter((i) => i.id !== id);
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();

  const customerField = document.getElementById("customerName");
  if (customerField) customerField.value = "";
}

/* ============================= */
/* CHECKOUT */
/* ============================= */

async function checkout(paymentMethod) {
  if (cart.length === 0) {
    alert("Cart is empty");
    return;
  }

  const total = Number(document.getElementById("total")?.innerText || 0);
  const customer = document.getElementById("customerName")?.value.trim() || "";
  const cashier = localStorage.getItem("cashier") || "Admin";

  const sale = {
    items: cart.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      qty: Number(item.qty)
    })),
    total,
    payment: paymentMethod,
    paymentMethod,
    customer,
    cashier,
    date: new Date().toLocaleString()
  };

  try {
    const result = await window.api.saveSale(sale);

    if (!result || result.success === false) {
      alert(result?.message || "Checkout failed");
      return;
    }

    const printableSale = {
      ...sale,
      id: result.saleId
    };

    localStorage.setItem("receipt", JSON.stringify(printableSale));

    const previewResult = await window.api.openReceipt();

    if (!previewResult?.success) {
      alert(previewResult?.message || "Could not open receipt preview");
      return;
    }

    clearCart();
    await loadProducts();
  } catch (error) {
    console.error("checkout error:", error);
    alert("Checkout failed");
  }
}

/* ============================= */
/* INVENTORY - ADD PRODUCT */
/* ============================= */
async function addProduct() {
  const name = document.getElementById("productName")?.value.trim();
  const cost = parseFloat(document.getElementById("productCost")?.value);
  const price = parseFloat(document.getElementById("productPrice")?.value);
  const stock = parseInt(document.getElementById("productStock")?.value, 10);
  const barcode = document.getElementById("productBarcode")?.value.trim() || "";
  const category = document.getElementById("productCategory")?.value.trim() || "";

  if (!name) {
    alert("Please enter product name");
    return;
  }

  if (isNaN(cost) || isNaN(price) || isNaN(stock)) {
    alert("Please fill cost, price and stock correctly");
    return;
  }

  try {
    const result = await window.api.addProduct({
      name,
      cost,
      price,
      stock,
      barcode,
      category
    });

    if (result && result.success) {
      clearProductForm();
      await loadInventory();
      alert("Product added successfully");
    } else {
      alert(result?.message || "Failed to add product");
    }
  } catch (error) {
    console.error("addProduct error:", error);
    alert("Failed to add product");
  }
}

function clearProductForm() {
  [
    "productName",
    "productCost",
    "productPrice",
    "productStock",
    "productBarcode",
    "productCategory"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

/* ============================= */
/* INVENTORY - LOAD / RENDER */
/* ============================= */
async function loadInventory() {
  try {
    allProducts = await window.api.getProducts();
    renderInventory(allProducts);
  } catch (error) {
    console.error("loadInventory error:", error);
  }
}

function renderInventory(products) {
  const table = document.getElementById("InventoryTable");
  if (!table) return;

  table.innerHTML = "";

  products.forEach((p) => {
    const tr = document.createElement("tr");
    const isEditing = editingProductId === p.id;

    if (isEditing) {
      tr.innerHTML = `
        <td><input id="edit-name-${p.id}" value="${escapeHtml(p.name || "")}" /></td>
        <td><input id="edit-cost-${p.id}" type="number" step="0.01" value="${Number(p.cost ?? 0)}" /></td>
        <td><input id="edit-price-${p.id}" type="number" step="0.01" value="${Number(p.price ?? 0)}" /></td>
        <td><input id="edit-stock-${p.id}" type="number" value="${Number(p.stock ?? 0)}" /></td>
        <td><input id="edit-barcode-${p.id}" value="${escapeHtml(p.barcode || "")}" /></td>
        <td><input id="edit-category-${p.id}" value="${escapeHtml(p.category || "")}" /></td>
        <td class="action-cell">
          <button class="save-btn" onclick="saveEdit(${p.id})">Save</button>
          <button class="cancel-btn" onclick="cancelEdit()">Cancel</button>
        </td>
      `;
    } else {
      tr.innerHTML = `
        <td>${escapeHtml(p.name || "")}</td>
        <td>${Number(p.cost ?? 0)}</td>
        <td>${Number(p.price ?? 0)}</td>
        <td>${Number(p.stock ?? 0)}</td>
        <td>${escapeHtml(p.barcode || "")}</td>
        <td>${escapeHtml(p.category || "")}</td>
        <td class="action-cell">
          <button class="edit-btn" onclick="editProduct(${p.id})">Edit</button>
          <button class="delete-btn" onclick="deleteProduct(${p.id})">Delete</button>
        </td>
      `;
    }

    table.appendChild(tr);
  });
}

function searchInventory() {
  const search = document.getElementById("searchInventory")?.value.toLowerCase() || "";

  const filtered = allProducts.filter((p) =>
    (p.name || "").toLowerCase().includes(search) ||
    String(p.barcode || "").toLowerCase().includes(search) ||
    (p.category || "").toLowerCase().includes(search)
  );

  renderInventory(filtered);
}

/* ============================= */
/* INVENTORY - EDIT */
/* ============================= */
window.editProduct = function editProduct(id) {
  editingProductId = id;
  renderInventory(allProducts);
};

window.cancelEdit = function cancelEdit() {
  editingProductId = null;
  renderInventory(allProducts);
};

window.saveEdit = async function saveEdit(id) {
  const updatedProduct = {
    id,
    name: document.getElementById(`edit-name-${id}`)?.value.trim(),
    cost: parseFloat(document.getElementById(`edit-cost-${id}`)?.value),
    price: parseFloat(document.getElementById(`edit-price-${id}`)?.value),
    stock: parseInt(document.getElementById(`edit-stock-${id}`)?.value, 10),
    barcode: document.getElementById(`edit-barcode-${id}`)?.value.trim() || "",
    category: document.getElementById(`edit-category-${id}`)?.value.trim() || ""
  };

  if (!updatedProduct.name) {
    alert("Product name is required");
    return;
  }

  if (
    isNaN(updatedProduct.cost) ||
    isNaN(updatedProduct.price) ||
    isNaN(updatedProduct.stock)
  ) {
    alert("Please enter valid cost, price and stock");
    return;
  }

  try {
    const result = await window.api.updateProduct(updatedProduct);

    if (result && result.success) {
      editingProductId = null;
      await loadInventory();
      alert("Product updated successfully");
    } else {
      alert(result?.message || "Failed to update product");
    }
  } catch (error) {
    console.error("saveEdit error:", error);
    alert("Failed to update product");
  }
};

window.deleteProduct = async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;

  try {
    const result = await window.api.deleteProduct(id);

    if (result && result.success) {
      await loadInventory();
    } else {
      alert(result?.message || "Failed to delete product");
    }
  } catch (error) {
    console.error("deleteProduct error:", error);
    alert("Failed to delete product");
  }
};

/* ============================= */
/* SETTINGS / USERS */
/* ============================= */
async function addUser() {
  if (isAddingUser) return;

  const btn = document.getElementById("addUserBtn");
  const username = document.getElementById("newUsername")?.value.trim();
  const password = document.getElementById("newPassword")?.value.trim();
  const role = document.getElementById("role")?.value || "cashier";

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  try {
    isAddingUser = true;
    if (btn) btn.disabled = true;

    const result = await window.api.addUser({ username, password, role });
    alert(result?.message || "Request completed");

    if (result?.success) {
      document.getElementById("newUsername").value = "";
      document.getElementById("newPassword").value = "";
      document.getElementById("role").value = "cashier";
    }
  } catch (error) {
    console.error("addUser error:", error);
    alert("Failed to add user");
  } finally {
    isAddingUser = false;
    if (btn) btn.disabled = false;
  }
}

/* ============================= */
/* DASHBOARD */
/* ============================= */
async function loadSalesDashboard() {
  try {
    const sales = await window.api.getSales();
    const table = document.getElementById("recentSales");
    if (!table) return;

    table.innerHTML = "";
    let total = 0;

    sales
      .slice()
      .reverse()
      .slice(0, 10)
      .forEach((s) => {
        total += Number(s.total);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${s.id}</td>
          <td>GHS ${Number(s.total).toFixed(2)}</td>
          <td>${s.date}</td>
          <td><button onclick="reprintReceipt(${s.id})">Reprint</button></td>
        `;
        table.appendChild(tr);
      });

    const salesTotal = document.getElementById("salesTotal");
    if (salesTotal) salesTotal.innerText = "GHS " + total.toFixed(2);
  } catch (error) {
    console.error("loadSalesDashboard error:", error);
  }
}

async function loadDailySalesChart() {
  const canvas = document.getElementById("dailyChart");
  if (!canvas || typeof Chart === "undefined") return;

  try {
    const data = await window.api.getDailySales();
    if (!data || data.length === 0) return;

    const labels = data.map((d) => d.day);
    const totals = data.map((d) => Number(d.total || 0));

    new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Daily Sales (GHS)",
            data: totals
          }
        ]
      }
    });
  } catch (error) {
    console.error("loadDailySalesChart error:", error);
  }
}

async function loadBestSellingChart() {
  const canvas = document.getElementById("productChart");
  if (!canvas || typeof Chart === "undefined") return;

  try {
    const data = await window.api.getBestSelling();
    if (!data || data.length === 0) return;

    const labels = data.map((p) => p.product);
    const qty = data.map((p) => Number(p.total || 0));

    new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Best Selling Products",
            data: qty
          }
        ]
      }
    });
  } catch (error) {
    console.error("loadBestSellingChart error:", error);
  }
}

async function loadProfitTable() {
  try {
    const data = await window.api.getProfitReport();
    const table = document.getElementById("profitTable");
    if (!table) return;

    table.innerHTML = "";

    data.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.product)}</td>
        <td>GHS ${Number(item.cost || 0).toFixed(2)}</td>
        <td>GHS ${Number(item.price || 0).toFixed(2)}</td>
        <td>${Number(item.qtySold || 0)}</td>
        <td>GHS ${Number(item.revenue || 0).toFixed(2)}</td>
        <td style="color:lime">GHS ${Number(item.profit || 0).toFixed(2)}</td>
      `;
      table.appendChild(tr);
    });
  } catch (error) {
    console.error("loadProfitTable error:", error);
  }
}

async function loadAnalytics(range = "today") {
  const canvas = document.getElementById("profitChart");
  if (!canvas || typeof Chart === "undefined") return;

  try {
    const profitData = await window.api.getProfitByRange(range);
    if (!profitData || profitData.length === 0) return;

    const labels = profitData.map((d) => d.label);
    const profits = profitData.map((d) => Number(d.profit || 0));

    if (profitChart) {
      profitChart.destroy();
    }

    profitChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Profit (GHS)",
            data: profits,
            borderWidth: 2
          }
        ]
      }
    });
  } catch (error) {
    console.error("loadAnalytics error:", error);
  }
}

async function loadKPI() {
  try {
    const data = await window.api.getKPI();
    if (!data) return;

    const revenueEl = document.getElementById("kpiRevenue");
    const profitEl = document.getElementById("kpiProfit");
    const ordersEl = document.getElementById("kpiOrders");
    const bestEl = document.getElementById("kpiBest");

    if (revenueEl) revenueEl.innerText = "GHS " + Number(data.revenue || 0).toFixed(2);
    if (profitEl) profitEl.innerText = "GHS " + Number(data.profit || 0).toFixed(2);
    if (ordersEl) ordersEl.innerText = Number(data.orders || 0);
    if (bestEl) bestEl.innerText = data.bestProduct || "N/A";
  } catch (error) {
    console.error("loadKPI error:", error);
  }
}

async function reprintReceipt(id) {
  try {
    const sale = await window.api.getReceiptData(id);

    if (!sale) {
      alert("Sale not found");
      return;
    }

    localStorage.setItem("receipt", JSON.stringify(sale));

    const previewResult = await window.api.openReceipt();

    if (!previewResult?.success) {
      alert(previewResult?.message || "Could not open receipt preview");
    }
  } catch (error) {
    console.error("reprintReceipt error:", error);
    alert("Failed to reprint receipt");
  }
}

async function resetSystemData() {
  const confirmed = confirm(
    "This will permanently delete all products, sales, receipt history, dashboard totals, profit data, and best-selling product records.\n\nUsers will remain intact.\n\nDo you want to continue?"
  );

  if (!confirmed) return;

  const confirmedAgain = confirm(
    "Final warning: this action cannot be undone.\n\nClick OK to reset all business data."
  );

  if (!confirmedAgain) return;

  try {
    const result = await window.api.resetSystemData();
    console.log("resetSystemData result:", result);

    if (result?.success) {
      alert(result.message || "Business data reset successfully");

      if (typeof clearCart === "function") clearCart();
      if (typeof loadProducts === "function") await loadProducts();
      if (typeof loadInventory === "function") await loadInventory();
      if (typeof loadSalesDashboard === "function") await loadSalesDashboard();
      if (typeof loadDailySalesChart === "function") await loadDailySalesChart();
      if (typeof loadBestSellingChart === "function") await loadBestSellingChart();
      if (typeof loadProfitTable === "function") await loadProfitTable();
      if (typeof loadAnalytics === "function") await loadAnalytics("today");
      if (typeof loadKPI === "function") await loadKPI();

      location.reload();
      return;
    }

    alert(result?.message || "Failed to reset system data.");
  } catch (error) {
    console.error("resetSystemData error:", error);
    alert("Failed to reset system data.");
  }
}

async function downloadReport() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("jsPDF not loaded");
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const sales = await window.api.getSales();
    const profitData = await window.api.getProfitReport();

    doc.setFontSize(18);
    doc.text("Damdala POS Report", 14, 15);

    doc.setFontSize(10);
    doc.text("Date: " + new Date().toLocaleString(), 14, 22);

    const salesRows = sales.map((s) => [s.id, "GHS " + s.total, s.date]);

    doc.autoTable({
      startY: 30,
      head: [["ID", "Total", "Date"]],
      body: salesRows
    });

    const profitRows = profitData.map((p) => [
      p.product,
      p.qtySold,
      "GHS " + p.revenue,
      "GHS " + p.profit
    ]);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Product", "Qty Sold", "Revenue", "Profit"]],
      body: profitRows
    });

    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const totalProfit = profitData.reduce((sum, p) => sum + Number(p.profit || 0), 0);

    doc.text("Total Revenue: GHS " + totalRevenue.toFixed(2), 14, doc.lastAutoTable.finalY + 20);
    doc.text("Total Profit: GHS " + totalProfit.toFixed(2), 14, doc.lastAutoTable.finalY + 28);

    doc.save("POS_Report.pdf");
  } catch (error) {
    console.error("downloadReport error:", error);
    alert("Failed to download report");
  }
}

/* ============================= */
/* HELPERS */
/* ============================= */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* ============================= */
/* PAGE LOAD */
/* ============================= */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("products")) {
    loadProducts();
  }

  if (document.getElementById("InventoryTable")) {
    loadInventory();
  }

  if (document.getElementById("recentSales")) {
    loadSalesDashboard();
  }

  if (document.getElementById("dailyChart")) {
    loadDailySalesChart();
  }

  if (document.getElementById("productChart")) {
    loadBestSellingChart();
  }

  if (document.getElementById("profitTable")) {
    loadProfitTable();
  }

  if (document.getElementById("profitChart")) {
    loadAnalytics("today");
  }

  if (document.getElementById("kpiRevenue")) {
    loadKPI();
  }

  const btn = document.getElementById("addUserBtn");
  if (btn) {
    btn.addEventListener("click", addUser);
  }

  const resetBtn = document.getElementById("resetSystemBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetSystemData);
  }

  const role = localStorage.getItem("role");
  if (role === "cashier") {
    document.getElementById("profitSection")?.remove();
    document.getElementById("profitChartSection")?.remove();
    document.getElementById("kpiProfit")?.parentElement?.remove();
    document.querySelector("button[onclick='downloadReport()']")?.remove();
  }
});