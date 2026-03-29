const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const ExcelJS = require("exceljs");
const db = require("./database");

let mainWindow;
let receiptWindow;

function getPreferredPrinter(printers = []) {
  const exactPreferredNames = [
    "EPSON TM-T20II Receipt",
    "EPSON TM-T20II Receipt5"
  ];

  return (
    printers.find((p) => exactPreferredNames.includes(p.name)) ||
    printers.find(
      (p) =>
        p.name.toLowerCase().includes("tm-t20ii") &&
        !p.name.toLowerCase().includes("(copy")
    ) ||
    printers.find(
      (p) =>
        p.name.toLowerCase().includes("epson") &&
        !p.name.toLowerCase().includes("(copy")
    ) ||
    null
  );
}

/* ============================= */
/* DB HELPERS */
/* ============================= */
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}



function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function ensureSettingsTable() {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      store_name TEXT DEFAULT 'Damdala Phones and Accessories',
      store_phone TEXT DEFAULT '',
      store_address TEXT DEFAULT '',
      receipt_footer TEXT DEFAULT 'Thank you for your purchase',
      currency TEXT DEFAULT 'GHS',
      logo_path TEXT DEFAULT ''
    )
  `);

  const columns = await allQuery(`PRAGMA table_info(settings)`);
  const names = columns.map((c) => c.name);

  if (!names.includes("store_phone")) {
    await runQuery(`ALTER TABLE settings ADD COLUMN store_phone TEXT DEFAULT ''`);
  }

  if (!names.includes("store_address")) {
    await runQuery(`ALTER TABLE settings ADD COLUMN store_address TEXT DEFAULT ''`);
  }

  if (!names.includes("receipt_footer")) {
    await runQuery(
      `ALTER TABLE settings ADD COLUMN receipt_footer TEXT DEFAULT 'Thank you for your purchase'`
    );
  }

  if (!names.includes("currency")) {
    await runQuery(`ALTER TABLE settings ADD COLUMN currency TEXT DEFAULT 'GHS'`);
  }

  if (!names.includes("logo_path")) {
    await runQuery(`ALTER TABLE settings ADD COLUMN logo_path TEXT DEFAULT ''`);
  }

  await runQuery(
    `
    INSERT OR IGNORE INTO settings
    (id, store_name, store_phone, store_address, receipt_footer, currency, logo_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      1,
      "Damdala Phones and Accessories",
      "",
      "",
      "Thank you for your purchase",
      "GHS",
      ""
    ]
  );
}

async function initDatabase() {
  try {
    await ensureSettingsTable();
    console.log("Database init complete");
  } catch (error) {
    console.error("Database init failed:", error);
    throw error;
  }
}

/* ============================= */
/* CREATE WINDOW */
/* ============================= */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "login.html"));
}

app.whenReady().then(async () => {
  try {
    await initDatabase();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error("App startup failed:", error);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ============================= */
/* NAVIGATION */
/* ============================= */
ipcMain.on("goPOS", () => {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
});

ipcMain.on("goInventory", () => {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, "renderer", "inventory.html"));
});

ipcMain.on("goDashboard", () => {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, "renderer", "dashboard.html"));
});

ipcMain.on("goSettings", () => {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, "renderer", "settings.html"));
});

ipcMain.on("logout", () => {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, "renderer", "login.html"));
});

/* ============================= */
/* AUTH */
/* ============================= */
ipcMain.handle("login-user", async (event, username, password) => {
  try {
    const user = await new Promise((resolve) => {
      db.get(
        "SELECT * FROM users WHERE username = ?",
        [username],
        (err, row) => {
          if (err) {
            console.error("Login query error:", err.message);
            resolve(null);
            return;
          }
          resolve(row);
        }
      );
    });

    if (!user) {
      return { success: false };
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return { success: false };
    }

    const finalRole =
      String(user.username).toLowerCase() === "admin"
        ? "admin"
        : user.role || "cashier";

    return {
      success: true,
      role: finalRole
    };
  } catch (error) {
    console.error("login-user error:", error);
    return { success: false };
  }
});

ipcMain.handle("add-user", async (event, userData) => {
  try {
    const { username, password, role } = userData;

    if (!username || !password || !role) {
      return {
        success: false,
        message: "Please fill all fields"
      };
    }

    return await new Promise((resolve) => {
      db.get(
        "SELECT * FROM users WHERE username = ?",
        [username],
        async (checkErr, existingUser) => {
          if (checkErr) {
            console.error("Check user error:", checkErr.message);
            resolve({
              success: false,
              message: "Database error while checking username"
            });
            return;
          }

          if (existingUser) {
            resolve({
              success: false,
              message: "Username already exists. Please use another username."
            });
            return;
          }

          try {
            const hashedPassword = await bcrypt.hash(password, 10);

            db.run(
              "INSERT INTO users(username,password,role) VALUES(?,?,?)",
              [username, hashedPassword, role],
              function (insertErr) {
                if (insertErr) {
                  console.error("Insert user error:", insertErr.message);
                  resolve({
                    success: false,
                    message: insertErr.message
                  });
                  return;
                }

                resolve({
                  success: true,
                  message: "User added successfully"
                });
              }
            );
          } catch (hashErr) {
            console.error("Hash error:", hashErr.message);
            resolve({
              success: false,
              message: "Error securing password"
            });
          }
        }
      );
    });
  } catch (error) {
    console.error("add-user handler error:", error);
    return {
      success: false,
      message: "Unexpected error adding user"
    };
  }
});

/* ============================= */
/* SETTINGS */
/* ============================= */
ipcMain.handle("save-Settings", async (event, settings) => {
  try {
    await runQuery(
      `
      UPDATE settings
      SET
        store_name = ?,
        store_phone = ?,
        store_address = ?
      WHERE id = 1
      `,
      [
        settings.store || "Damdala Phones and Accessories",
        settings.phone || "",
        settings.address || ""
      ]
    );

    return { success: true };
  } catch (error) {
    console.error("save-Settings error:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle("reset-system-data", async () => {
  try {
    console.log("reset-system-data called");

    return await new Promise((resolve) => {
      db.serialize(() => {
        db.run("PRAGMA foreign_keys = OFF");

        db.run("BEGIN TRANSACTION", (beginErr) => {
          if (beginErr) {
            console.error("BEGIN error:", beginErr.message);
            resolve({ success: false, message: beginErr.message });
            return;
          }

          db.run("DELETE FROM sale_items", [], (err1) => {
            if (err1) {
              console.error("DELETE sale_items error:", err1.message);
              db.run("ROLLBACK");
              resolve({ success: false, message: err1.message });
              return;
            }

            db.run("DELETE FROM sales", [], (err2) => {
              if (err2) {
                console.error("DELETE sales error:", err2.message);
                db.run("ROLLBACK");
                resolve({ success: false, message: err2.message });
                return;
              }

              db.run("DELETE FROM products", [], (err3) => {
                if (err3) {
                  console.error("DELETE products error:", err3.message);
                  db.run("ROLLBACK");
                  resolve({ success: false, message: err3.message });
                  return;
                }

                // sqlite_sequence may not exist or may not contain these names
                db.run("DELETE FROM sqlite_sequence WHERE name='sale_items'", [], () => {
                  db.run("DELETE FROM sqlite_sequence WHERE name='sales'", [], () => {
                    db.run("DELETE FROM sqlite_sequence WHERE name='products'", [], () => {
                      db.run("COMMIT", (commitErr) => {
                        db.run("PRAGMA foreign_keys = ON");

                        if (commitErr) {
                          console.error("COMMIT error:", commitErr.message);
                          resolve({ success: false, message: commitErr.message });
                          return;
                        }

                        console.log("reset-system-data completed successfully");
                        resolve({
                          success: true,
                          message: "Business data reset successfully"
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error("reset-system-data fatal error:", error);
    return {
      success: false,
      message: error.message || "Reset failed"
    };
  }
});


ipcMain.handle("get-Settings", async () => {
  try {
    const rows = await allQuery(`SELECT * FROM settings WHERE id = 1`);
    return rows[0] || null;
  } catch (error) {
    console.error("get-Settings error:", error);
    return null;
  }
});

/* ============================= */
/* PRODUCTS */
/* ============================= */
ipcMain.handle("products", async () => {
  try {
    return await db.getProducts();
  } catch (error) {
    console.error("products error:", error);
    return [];
  }
});

ipcMain.handle("add-product", async (event, product) => {
  try {
    const { name, cost, price, stock, barcode, category } = product;

    if (!name || String(name).trim() === "") {
      return { success: false, message: "Product name is required" };
    }

    if (cost === undefined || price === undefined || stock === undefined) {
      return { success: false, message: "Cost, price and stock are required" };
    }

    await db.addProduct({
      name: String(name).trim(),
      cost: Number(cost),
      price: Number(price),
      stock: Number(stock),
      barcode: barcode || "",
      category: category || ""
    });

    return { success: true, message: "Product added successfully" };
  } catch (error) {
    console.error("add-product error:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle("deleteProduct", async (event, id) => {
  try {
    await db.deleteProduct(id);
    return { success: true };
  } catch (error) {
    console.error("deleteProduct error:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle("updateProduct", async (event, product) => {
  try {
    await db.updateProduct({
      id: Number(product.id),
      name: product.name,
      cost: Number(product.cost),
      price: Number(product.price),
      stock: Number(product.stock),
      barcode: product.barcode || "",
      category: product.category || ""
    });

    return { success: true, message: "Product updated successfully" };
  } catch (error) {
    console.error("updateProduct error:", error);
    return { success: false, message: error.message };
  }
});

/* ============================= */
/* SALES */
/* ============================= */
ipcMain.handle("getSales", async () => {
  try {
    return await new Promise((resolve) => {
      db.all("SELECT * FROM sales ORDER BY id ASC", [], (err, rows) => {
        if (err) {
          console.error("getSales error:", err.message);
          resolve([]);
          return;
        }
        resolve(rows || []);
      });
    });
  } catch (error) {
    console.error("getSales handler error:", error);
    return [];
  }
});

ipcMain.handle("getDailySales", async () => {
  try {
    return await new Promise((resolve) => {
      db.all(
        `
        SELECT date(date) as day, SUM(total) as total
        FROM sales
        GROUP BY day
        ORDER BY day ASC
        `,
        [],
        (err, rows) => {
          if (err) {
            console.error("getDailySales error:", err.message);
            resolve([]);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  } catch (error) {
    console.error("getDailySales handler error:", error);
    return [];
  }
});

ipcMain.handle("saveSale", async (event, data) => {
  try {
    return await new Promise((resolve) => {
      if (!data.items || !data.items.length) {
        resolve({ success: false, message: "Cart is empty" });
        return;
      }

      let stockError = null;
      let checked = 0;

      data.items.forEach((item) => {
        db.get(
          "SELECT stock FROM products WHERE name = ?",
          [item.name],
          (err, row) => {
            if (err) stockError = err.message;
            if (!row) {
              stockError = `Product not found: ${item.name}`;
            } else if (Number(row.stock) < Number(item.qty)) {
              stockError = `Not enough stock for ${item.name}. Available: ${row.stock}`;
            }

            checked++;

            if (checked === data.items.length) {
              if (stockError) {
                resolve({ success: false, message: stockError });
                return;
              }

              db.run(
                "INSERT INTO sales(total,date) VALUES (?, datetime('now'))",
                [Number(data.total)],
                function (insertErr) {
                  if (insertErr) {
                    resolve({
                      success: false,
                      message: insertErr.message
                    });
                    return;
                  }

                  const saleId = this.lastID;
                  let processed = 0;

                  data.items.forEach((itemRow) => {
                    db.run(
                      "INSERT INTO sale_items(sale_id,product,price,qty) VALUES (?,?,?,?)",
                      [saleId, itemRow.name, Number(itemRow.price), Number(itemRow.qty)],
                      (itemErr) => {
                        if (itemErr) {
                          console.error("save sale_items error:", itemErr.message);
                        }

                        db.run(
                          "UPDATE products SET stock = stock - ? WHERE name = ?",
                          [Number(itemRow.qty), itemRow.name],
                          (stockErr) => {
                            if (stockErr) {
                              console.error("stock update error:", stockErr.message);
                            }

                            processed++;
                            if (processed === data.items.length) {
                              resolve({ success: true, saleId });
                            }
                          }
                        );
                      }
                    );
                  });
                }
              );
            }
          }
        );
      });
    });
  } catch (error) {
    console.error("saveSale error:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle("getBestSelling", async () => {
  try {
    return await new Promise((resolve) => {
      db.all(
        `
        SELECT product, SUM(qty) as total
        FROM sale_items
        GROUP BY product
        ORDER BY total DESC
        LIMIT 10
        `,
        [],
        (err, rows) => {
          if (err) {
            console.error("getBestSelling error:", err.message);
            resolve([]);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  } catch (error) {
    console.error("getBestSelling handler error:", error);
    return [];
  }
});

ipcMain.handle("getProfitReport", async () => {
  try {
    return await new Promise((resolve) => {
      db.all(
        `
        SELECT 
          p.name as product,
          p.cost,
          p.price,
          SUM(si.qty) as qtySold,
          SUM(si.qty * si.price) as revenue,
          SUM(si.qty * (p.price - p.cost)) as profit
        FROM sale_items si
        JOIN products p ON si.product = p.name
        GROUP BY si.product
        ORDER BY profit DESC
        `,
        [],
        (err, rows) => {
          if (err) {
            console.error("getProfitReport error:", err.message);
            resolve([]);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  } catch (error) {
    console.error("getProfitReport handler error:", error);
    return [];
  }
});

ipcMain.handle("getSalesByRange", async (event, range) => {
  try {
    return await new Promise((resolve) => {
      let query = "";

      if (range === "today") {
        query = `
          SELECT substr(date,1,10) as label, SUM(total) as total
          FROM sales
          WHERE date(date) = date('now')
          GROUP BY label
        `;
      } else if (range === "week") {
        query = `
          SELECT strftime('%Y-%W', date) as label, SUM(total) as total
          FROM sales
          GROUP BY label
        `;
      } else {
        query = `
          SELECT strftime('%Y-%m', date) as label, SUM(total) as total
          FROM sales
          GROUP BY label
        `;
      }

      db.all(query, [], (err, rows) => {
        if (err) {
          console.error("getSalesByRange error:", err.message);
          resolve([]);
          return;
        }
        resolve(rows || []);
      });
    });
  } catch (error) {
    console.error("getSalesByRange handler error:", error);
    return [];
  }
});

ipcMain.handle("getProfitByRange", async (event, range) => {
  try {
    return await new Promise((resolve) => {
      let group = "substr(s.date,1,10)";

      if (range === "week") group = "strftime('%Y-%W', s.date)";
      if (range === "month") group = "strftime('%Y-%m', s.date)";

      db.all(
        `
        SELECT 
          ${group} as label,
          SUM(si.qty * (p.price - p.cost)) as profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product = p.name
        GROUP BY label
        ORDER BY label ASC
        `,
        [],
        (err, rows) => {
          if (err) {
            console.error("getProfitByRange error:", err.message);
            resolve([]);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  } catch (error) {
    console.error("getProfitByRange handler error:", error);
    return [];
  }
});

ipcMain.handle("getKPI", async () => {
  try {
    return await new Promise((resolve) => {
      db.all(
        `
        SELECT 
          (SELECT SUM(total) FROM sales) as revenue,
          (SELECT COUNT(*) FROM sales) as orders,
          (SELECT SUM(si.qty * (p.price - p.cost))
           FROM sale_items si
           JOIN products p ON si.product = p.name) as profit,
          (SELECT product
           FROM sale_items
           GROUP BY product
           ORDER BY SUM(qty) DESC
           LIMIT 1) as bestProduct
        `,
        [],
        (err, rows) => {
          if (err) {
            console.error("getKPI error:", err.message);
            resolve({
              revenue: 0,
              orders: 0,
              profit: 0,
              bestProduct: "N/A"
            });
            return;
          }

          resolve(
            rows?.[0] || {
              revenue: 0,
              orders: 0,
              profit: 0,
              bestProduct: "N/A"
            }
          );
        }
      );
    });
  } catch (error) {
    console.error("getKPI handler error:", error);
    return {
      revenue: 0,
      orders: 0,
      profit: 0,
      bestProduct: "N/A"
    };
  }
});

ipcMain.handle("getReceiptData", async (event, saleId) => {
  try {
    return await new Promise((resolve) => {
      db.all(
        "SELECT * FROM sale_items WHERE sale_id = ?",
        [saleId],
        (itemsErr, items) => {
          if (itemsErr) {
            console.error("getReceiptData items error:", itemsErr.message);
            resolve(null);
            return;
          }

          db.get(
            "SELECT * FROM sales WHERE id = ?",
            [saleId],
            (saleErr, sale) => {
              if (saleErr || !sale) {
                console.error("getReceiptData sale error:", saleErr?.message);
                resolve(null);
                return;
              }

              resolve({
                id: sale.id,
                total: sale.total,
                date: sale.date,
                items: items || []
              });
            }
          );
        }
      );
    });
  } catch (error) {
    console.error("getReceiptData handler error:", error);
    return null;
  }
});

/* ============================= */
/* RECEIPT WINDOW */
/* ============================= */

ipcMain.handle("openReceipt", async () => {
  try {
    if (receiptWindow && !receiptWindow.isDestroyed()) {
      receiptWindow.focus();
      return { success: true };
    }

    receiptWindow = new BrowserWindow({
      width: 400,
      height: 700,
      autoHideMenuBar: true,
      parent: mainWindow,
      modal: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    await receiptWindow.loadFile(path.join(__dirname, "renderer", "receipt.html"));

    receiptWindow.on("closed", () => {
      receiptWindow = null;
    });

    return { success: true };
  } catch (error) {
    console.error("openReceipt error:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle("get-printers", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const printers = await win.webContents.getPrintersAsync();
    return printers || [];
  } catch (error) {
    console.error("get-printers error:", error);
    return [];
  }
});

/* ============================= */
/* PRINT RECEIPT */
/* ============================= */


ipcMain.handle("printReceipt", async () => {
  try {
    if (!receiptWindow || receiptWindow.isDestroyed()) {
      return { success: false, message: "No receipt window available" };
    }

    const printers = await receiptWindow.webContents.getPrintersAsync();
    console.log("Available printers:", printers.map((p) => p.name));

    const exactPreferredPrinter = "EPSON TM-T20II Receipt";
    let targetPrinter = printers.find((p) => p.name === exactPreferredPrinter);

    if (!targetPrinter) {
      console.warn(`Preferred printer not found: ${exactPreferredPrinter}`);
      return {
        success: false,
        message: `Printer "${exactPreferredPrinter}" not found. Please check Devices and Printers in Windows.`
      };
    }

    console.log("Using printer:", targetPrinter.name);

    return await new Promise((resolve) => {
      receiptWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          deviceName: targetPrinter.name,
          margins: { marginType: "none" },
          landscape: false
        },
        (success, failureReason) => {
          console.log("PRINT CALLBACK:", { success, failureReason });

          if (success) {
            resolve({
              success: true,
              printer: targetPrinter.name
            });
            return;
          }

          if ((failureReason || "").toLowerCase().includes("cancel")) {
            resolve({
              success: false,
              canceled: true,
              message: "Print canceled"
            });
            return;
          }

          resolve({
            success: false,
            message: failureReason || "Print failed"
          });
        }
      );
    });
  } catch (error) {
    console.error("printReceipt error:", error);
    return { success: false, message: error.message };
  }
});

/* ============================= */
/* REPORTS / BACKUP */
/* ============================= */
function generateDailyReport() {
  db.all(
    "SELECT * FROM sales WHERE date(date)=date('now')",
    [],
    async (err, rows) => {
      if (err) {
        console.error("generateDailyReport error:", err.message);
        return;
      }

      if (!rows || !rows.length) return;

      try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Daily Sales");

        sheet.columns = [
          { header: "ID", key: "id" },
          { header: "Total", key: "total" },
          { header: "Date", key: "date" }
        ];

        rows.forEach((r) => sheet.addRow(r));

        const folder = path.join(__dirname, "reports");
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder);
        }

        const file = path.join(folder, `sales-${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(file);

        console.log("Daily sales report saved:", file);
      } catch (reportError) {
        console.error("daily report write error:", reportError);
      }
    }
  );
}

function backupDatabase() {
  try {
    const source = path.join(app.getPath("userData"), "pos.db");
    const folder = path.join(__dirname, "backup");

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }

    const backup = path.join(folder, `backup-${Date.now()}.db`);

    fs.copyFile(source, backup, (err) => {
      if (err) {
        console.error("Database backup error:", err.message);
        return;
      }
      console.log("Database backup created:", backup);
    });
  } catch (error) {
    console.error("backupDatabase error:", error);
  }
}

setInterval(generateDailyReport, 86400000);
setInterval(backupDatabase, 3600000);