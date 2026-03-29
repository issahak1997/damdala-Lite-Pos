const { contextBridge, ipcRenderer } = require("electron");

/* ============================= */
/* NAVIGATION */
/* ============================= */
contextBridge.exposeInMainWorld("nav", {
  goPOS: () => ipcRenderer.send("goPOS"),
  goInventory: () => ipcRenderer.send("goInventory"),
  goDashboard: () => ipcRenderer.send("goDashboard"),
  goSettings: () => ipcRenderer.send("goSettings"),
  logout: () => ipcRenderer.send("logout")
});

/* ============================= */
/* API */
/* ============================= */
contextBridge.exposeInMainWorld("api", {
  /* AUTH */
  loginUser: (username, password) => ipcRenderer.invoke("login-user", username, password),
  addUser: (user) => ipcRenderer.invoke("add-user", user),

  /* PRODUCTS */
  getProducts: () => ipcRenderer.invoke("products"),
  addProduct: (product) => ipcRenderer.invoke("add-product", product),
  deleteProduct: (id) => ipcRenderer.invoke("deleteProduct", id),
  updateProduct: (product) => ipcRenderer.invoke("updateProduct", product),

  /* SALES */
  saveSale: (sale) => ipcRenderer.invoke("saveSale", sale),
  getSales: () => ipcRenderer.invoke("getSales"),
  getDailySales: () => ipcRenderer.invoke("getDailySales"),
  getBestSelling: () => ipcRenderer.invoke("getBestSelling"),
  getProfitReport: () => ipcRenderer.invoke("getProfitReport"),
  getSalesByRange: (range) => ipcRenderer.invoke("getSalesByRange", range),
  getProfitByRange: (range) => ipcRenderer.invoke("getProfitByRange", range),
  getKPI: () => ipcRenderer.invoke("getKPI"),
  getReceiptData: (saleId) => ipcRenderer.invoke("getReceiptData", saleId),

  /* RECEIPT / PRINTING */
  openReceipt: () => ipcRenderer.invoke("openReceipt"),
  printReceipt: () => ipcRenderer.invoke("printReceipt"),
  getPrinters: () => ipcRenderer.invoke("get-printers"),

  /* SETTINGS */
  saveSettings: (settings) => ipcRenderer.invoke("save-Settings", settings),
  getSettings: () => ipcRenderer.invoke("get-Settings"),

  /* RESET */
  resetSystemData: () => ipcRenderer.invoke("reset-system-data")
});