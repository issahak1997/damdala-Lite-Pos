const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const { app } = require("electron");
const path = require("path");

/* DATABASE LOCATION */
const dbPath = path.join(app.getPath("userData"), "pos.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database connection error:", err.message);
  } else {
    console.log("Connected to database:", dbPath);
  }
});

/* HELPERS */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/* CREATE TABLES + MIGRATIONS */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      category TEXT,
      image TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sales(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL,
      date TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_name TEXT,
      phone TEXT,
      address TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sale_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER,
      product TEXT,
      price REAL,
      qty INTEGER
    )
  `);

  /* ADD ROLE COLUMN IF DATABASE WAS CREATED BEFORE */
  db.all(`PRAGMA table_info(users)`, (err, columns) => {
    if (err) {
      console.error("PRAGMA users error:", err.message);
      return;
    }

    const hasRole = columns.some((c) => c.name === "role");

    if (!hasRole) {
      db.run(
        `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'cashier'`,
        (alterErr) => {
          if (alterErr) {
            console.error("Add role column error:", alterErr.message);
          } else {
            console.log("Role column added to users table");
          }
        }
      );
    }
  });

  /* ADD COST COLUMN IF DATABASE WAS CREATED BEFORE */
  db.all(`PRAGMA table_info(products)`, (err, columns) => {
    if (err) {
      console.error("PRAGMA products error:", err.message);
      return;
    }

    const hasCost = columns.some((c) => c.name === "cost");

    if (!hasCost) {
      db.run(
        `ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0`,
        (alterErr) => {
          if (alterErr) {
            console.error("Add cost column error:", alterErr.message);
          } else {
            console.log("Cost column added to products table");
          }
        }
      );
    }
  });

  /* MAKE SURE DEFAULT ADMIN EXISTS */
  const password = bcrypt.hashSync("admin123", 10);

  db.run(
    `INSERT OR IGNORE INTO users(username,password,role) VALUES (?,?,?)`,
    ["admin", password, "admin"],
    (err) => {
      if (err) {
        console.error("Default admin insert error:", err.message);
      }
    }
  );

  /* FORCE ADMIN USER TO ALWAYS BE ADMIN */
  db.run(
    `UPDATE users SET role = 'admin' WHERE LOWER(username) = 'admin'`,
    (err) => {
      if (err) {
        console.error("Force admin role update error:", err.message);
      }
    }
  );

  /* GIVE OLD USERS A DEFAULT ROLE */
  db.run(
    `UPDATE users SET role = 'cashier' WHERE role IS NULL OR TRIM(role) = ''`,
    (err) => {
      if (err) {
        console.error("Old users role update error:", err.message);
      }
    }
  );

  /* DEMO PRODUCTS */
  db.run(`
    INSERT OR IGNORE INTO products(id,name,cost,price,stock,barcode,category,image)
    VALUES (1,'USB Cable',10,20,50,'1001','Accessories','usb-cable.jpg')
  `);

  db.run(`
    INSERT OR IGNORE INTO products(id,name,cost,price,stock,barcode,category,image)
    VALUES (2,'Tecno Phone',350,1000,10,'1002','Phones','tecno-phone.jpg')
  `);

  db.run(`
    INSERT OR IGNORE INTO products(id,name,cost,price,stock,barcode,category,image)
    VALUES (3,'Charger',40,80,30,'1003','Accessories','charger.jpg')
  `);
});

/* PRODUCT METHODS */
db.addProduct = async (product) => {
  const name = String(product.name || "").trim();
  const cost = Number(product.cost);
  const price = Number(product.price);
  const stock = parseInt(product.stock, 10);
  const barcode = String(product.barcode || "").trim();
  const category = String(product.category || "").trim();
  const image = product.image || "";

  if (!name) {
    throw new Error("Product name is required");
  }

  if (Number.isNaN(cost)) {
    throw new Error("Valid cost is required");
  }

  if (Number.isNaN(price)) {
    throw new Error("Valid price is required");
  }

  if (Number.isNaN(stock)) {
    throw new Error("Valid stock is required");
  }

  return run(
    `
      INSERT INTO products (name, cost, price, stock, barcode, category, image)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [name, cost, price, stock, barcode, category, image]
  );
};

db.getProducts = async () => {
  return all(`SELECT * FROM products ORDER BY id DESC`);
};

db.getProductById = async (id) => {
  return get(`SELECT * FROM products WHERE id = ?`, [id]);
};

db.updateProduct = async (product) => {
  const id = Number(product.id);
  const name = String(product.name || "").trim();
  const cost = Number(product.cost);
  const price = Number(product.price);
  const stock = parseInt(product.stock, 10);
  const barcode = String(product.barcode || "").trim();
  const category = String(product.category || "").trim();

  if (Number.isNaN(id)) {
    throw new Error("Valid product id is required");
  }

  if (!name) {
    throw new Error("Product name is required");
  }

  if (Number.isNaN(cost)) {
    throw new Error("Valid cost is required");
  }

  if (Number.isNaN(price)) {
    throw new Error("Valid price is required");
  }

  if (Number.isNaN(stock)) {
    throw new Error("Valid stock is required");
  }

  return run(
    `
      UPDATE products
      SET name = ?, cost = ?, price = ?, stock = ?, barcode = ?, category = ?
      WHERE id = ?
    `,
    [name, cost, price, stock, barcode, category, id]
  );
};

db.deleteProduct = async (id) => {
  return run(`DELETE FROM products WHERE id = ?`, [id]);
};

db.findProducts = async (search = "") => {
  const term = `%${String(search).trim()}%`;
  return all(
    `
      SELECT * FROM products
      WHERE name LIKE ?
         OR barcode LIKE ?
         OR category LIKE ?
      ORDER BY id DESC
    `,
    [term, term, term]
  );
};

module.exports = db;