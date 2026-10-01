require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 5000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const RESET_TOKEN_TTL_MINUTES = 30;
const recoveryRateLimits = new Map();
const LOSS_REASONS = new Set(["Damaged", "Expired", "Lost", "Stolen", "Spoiled", "Written Off", "Other"]);

const sessions = new Map();
const appInstance = app;
let emailTransport = null;

app.use(express.json());

app.use((req, res, next) => {
  const configuredOrigins = [
    process.env.CLIENT_ORIGINS,
    process.env.CLIENT_ORIGIN,
    process.env.PUBLIC_APP_URL,
    process.env.CLIENT_URL,
    "http://localhost:3000",
  ];
  const allowedOrigins = new Set();
  for (const value of configuredOrigins) {
    for (const candidate of String(value || "").split(",")) {
      try {
        const url = new URL(candidate.trim());
        if (url.protocol === "http:" || url.protocol === "https:") allowedOrigins.add(url.origin);
      } catch {
        continue;
      }
    }
  }

  const requestOrigin = req.headers.origin;
  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    if (requestOrigin && !allowedOrigins.has(requestOrigin)) return res.sendStatus(403);
    return res.sendStatus(204);
  }

  next();
});

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    businessName: user.businessName || user.name || "SpazaKeep",
    businessTagline: user.businessTagline || "A small business",
    role: user.role || "business_user",
    createdAt: user.createdAt,
  };
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash).split(":");
  if (!salt || !hash) return false;

  const expected = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

function consumeRecoveryLimit(key, limit, windowMs) {
  const now = Date.now();
  for (const [storedKey, entry] of recoveryRateLimits) {
    if (entry.expiresAt <= now) recoveryRateLimits.delete(storedKey);
  }

  const current = recoveryRateLimits.get(key);
  if (!current || current.expiresAt <= now) {
    if (recoveryRateLimits.size >= 10000) {
      const oldestKey = recoveryRateLimits.keys().next().value;
      if (oldestKey) recoveryRateLimits.delete(oldestKey);
    }
    recoveryRateLimits.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function getRequestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 100);
}

function maskEmail(email) {
  const [localPart, domain] = String(email).split("@");
  if (!domain) return "***";
  const visible = localPart.length > 2 ? localPart.slice(0, 2) : localPart.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(3, localPart.length - visible.length))}@${domain}`;
}

function getEmailTransport() {
  if (emailTransport) return emailTransport;

  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT);
  const user = String(process.env.SMTP_USER || "");
  const password = String(process.env.SMTP_PASS || "");
  const secureValue = String(process.env.SMTP_SECURE || "").toLowerCase();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !["true", "false"].includes(secureValue)) {
    throw new Error("SMTP configuration is incomplete.");
  }

  emailTransport = nodemailer.createTransport({
    host,
    port,
    secure: secureValue === "true",
    auth: { user, pass: password },
  });
  return emailTransport;
}

async function sendRecoveryEmail({ to, subject, text, html }) {
  const from = String(process.env.EMAIL_FROM || "").trim();
  if (!from) throw new Error("Email sender is not configured.");
  await getEmailTransport().sendMail({ from, to, subject, text, html });
}

function getPublicAppOrigin() {
  const configuredUrl = String(process.env.PUBLIC_APP_URL || "").trim();
  const fallbackUrl = process.env.NODE_ENV === "production"
    ? ""
    : String(process.env.CLIENT_URL || "http://localhost:3000").trim();
  const url = new URL(configuredUrl || fallbackUrl);

  if (!['http:', 'https:'].includes(url.protocol) || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("Public app URL must use HTTPS in production.");
  }

  return url.origin;
}

async function sendPasswordResetEmail(email, resetUrl) {
  const text = `We received a request to reset your password. Use this secure link within 30 minutes:\n\n${resetUrl}\n\nIf you did not request this change, you can ignore this email.`;
  const html = `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This secure link expires in 30 minutes. If you did not request this change, you can ignore this email.</p>`;
  await sendRecoveryEmail({ to: email, subject: "Reset your SpazaKeep password", text, html });
}

async function sendPasswordChangedEmail(email) {
  const text = "Your SpazaKeep password was changed successfully. If you did not make this change, contact your business administrator.";
  const html = "<p>Your SpazaKeep password was changed successfully.</p><p>If you did not make this change, contact your business administrator.</p>";
  await sendRecoveryEmail({ to: email, subject: "Your SpazaKeep password was changed", text, html });
}

function setEmailTransportForTests(transport) {
  emailTransport = transport;
}

function requireSession(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const user = token ? sessions.get(token) : null;

  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  return user;
}

function requireBusinessSession(req, res) {
  const user = requireSession(req, res);
  if (!user) return null;
  if (user.role === "admin") {
    res.status(403).json({ message: "Only a business account can manage its inventory losses." });
    return null;
  }
  return user;
}

function isValidUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDatabaseConnectionError(error) {
  const connectionCodes = new Set(["ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"]);
  const causes = [error, ...(Array.isArray(error?.errors) ? error.errors : [])];
  return causes.some((cause) => cause && connectionCodes.has(cause.code));
}

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDateOnly(value) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mapInventoryLoss(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    costPrice: Number(row.cost_price),
    lossAmount: Number(row.loss_amount),
    reason: row.reason,
    date: formatDateOnly(row.loss_date),
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      business_name TEXT NOT NULL DEFAULT 'SpazaKeep',
      business_tagline TEXT NOT NULL DEFAULT 'A small business',
      role TEXT NOT NULL DEFAULT 'business_user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'User'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT NOT NULL DEFAULT 'SpazaKeep'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS business_tagline TEXT NOT NULL DEFAULT 'A small business'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'business_user'");

  if (ADMIN_EMAIL) {
    await pool.query(
      `UPDATE users SET role = 'admin' WHERE LOWER(email) = $1`,
      [ADMIN_EMAIL],
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
      cost_price NUMERIC(12, 2) CHECK (cost_price >= 0),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) CHECK (cost_price >= 0)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reference TEXT NOT NULL UNIQUE,
      customer TEXT NOT NULL DEFAULT 'Walk-in Customer',
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
      tax NUMERIC(12, 2) NOT NULL CHECK (tax >= 0),
      total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
      total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
      total_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0)");
  await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_profit NUMERIC(12, 2) NOT NULL DEFAULT 0");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id UUID PRIMARY KEY,
      sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
      cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
      profit NUMERIC(12, 2) NOT NULL DEFAULT 0
    )
  `);

  await pool.query("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0)");
  await pool.query("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS profit NUMERIC(12, 2) NOT NULL DEFAULT 0");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_losses (
      id UUID PRIMARY KEY,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      business_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      cost_price NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
      loss_amount NUMERIC(12, 2) NOT NULL CHECK (loss_amount >= 0),
      reason TEXT NOT NULL CHECK (reason IN ('Damaged', 'Expired', 'Lost', 'Stolen', 'Spoiled', 'Written Off', 'Other')),
      notes TEXT,
      loss_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS inventory_losses_owner_date_idx ON inventory_losses (business_user_id, loss_date DESC, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS inventory_losses_owner_product_idx ON inventory_losses (business_user_id, product_id)");
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    businessName: row.business_name,
    businessTagline: row.business_tagline,
    role: row.role || "business_user",
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

app.get("/", (req, res) => {
  res.json({
    message: "API is running successfully",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "spazakeep-api" });
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password, businessName, businessTagline } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const safeBusinessName = String(businessName || name).trim() || "SpazaKeep";
  const safeBusinessTagline = String(businessTagline || "A small business").trim() || "A small business";
  const role = "business_user";

  if (normalizedEmail.length < 3 || String(password).length < 6) {
    return res.status(400).json({ message: "Email is invalid or password is too short." });
  }

  try {
    const existingUser = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1", [normalizedEmail]);
    if (existingUser.rows[0]) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const result = await pool.query(
      `INSERT INTO users (id, name, email, password_hash, business_name, business_tagline, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, password_hash, business_name, business_tagline, role, created_at`,
      [
        crypto.randomUUID(),
        String(name).trim(),
        normalizedEmail,
        hashPassword(String(password)),
        safeBusinessName,
        safeBusinessTagline,
        role,
      ],
    );

    const newUser = mapUser(result.rows[0]);
    const token = generateToken();
    sessions.set(token, newUser);

    return res.status(201).json({ token, user: sanitizeUser(newUser) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    console.error("Signup failed:", error);
    return res.status(500).json({ message: "Unable to create the account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await pool.query(
    "SELECT id, name, email, password_hash, business_name, business_tagline, role, created_at FROM users WHERE LOWER(email) = $1 LIMIT 1",
    [normalizedEmail],
  );
  const user = result.rows[0] ? mapUser(result.rows[0]) : null;

  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = generateToken();
  sessions.set(token, user);

  return res.json({
    token,
    user: sanitizeUser(user),
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const genericResponse = { message: "If an account exists for this email, a password reset link has been sent." };
  const normalizedEmail = String(req.body?.email || "").trim().toLowerCase();
  const ip = getRequestIp(req);

  if (!consumeRecoveryLimit(`forgot-ip:${ip}`, 10, 60 * 60 * 1000) ||
      (normalizedEmail && !consumeRecoveryLimit(`forgot-email:${normalizedEmail}`, 3, 60 * 60 * 1000))) {
    return res.json(genericResponse);
  }

  if (!normalizedEmail || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.json(genericResponse);
  }

  try {
    const result = await pool.query("SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1", [normalizedEmail]);
    if (!result.rows[0]) return res.json(genericResponse);

    const resetUrl = new URL("/", `${getPublicAppOrigin()}/`);
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    resetUrl.hash = new URLSearchParams({ resetToken: rawToken }).toString();
    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [result.rows[0].id]);
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'))`,
      [crypto.randomUUID(), result.rows[0].id, tokenHash, RESET_TOKEN_TTL_MINUTES],
    );
    try {
      await sendPasswordResetEmail(result.rows[0].email, resetUrl.toString());
    } catch (error) {
      await pool.query("DELETE FROM password_reset_tokens WHERE token_hash = $1", [tokenHash]);
      console.error("Password reset email delivery failed.");
    }
  } catch (error) {
    console.error("Password recovery request failed.");
  }

  return res.json(genericResponse);
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password, confirmPassword } = req.body || {};
  const rawToken = String(token || "");
  const newPassword = String(password || "");
  if (rawToken.length < 32 || rawToken.length > 200 || newPassword.length < 8 || newPassword.length > 256 || newPassword !== String(confirmPassword || "")) {
    return res.status(400).json({ message: "The reset link is invalid or expired, or the password fields are invalid." });
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT reset_token.id, reset_token.user_id, users.email
       FROM password_reset_tokens AS reset_token
       JOIN users ON users.id = reset_token.user_id
       WHERE reset_token.token_hash = $1 AND reset_token.expires_at > NOW()
       FOR UPDATE OF reset_token`,
      [tokenHash],
    );
    const resetToken = result.rows[0];
    if (!resetToken) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "The reset link is invalid or expired." });
    }

    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword(newPassword), resetToken.user_id]);
    await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [resetToken.user_id]);
    await client.query("COMMIT");

    for (const [sessionToken, user] of sessions) {
      if (user.id === resetToken.user_id) sessions.delete(sessionToken);
    }
    try {
      await sendPasswordChangedEmail(resetToken.email);
    } catch (error) {
      console.error("Password change confirmation email delivery failed.");
    }
    return res.json({ message: "Your password has been reset. Sign in with your new password." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Password reset failed.", error.message);
    return res.status(500).json({ message: "Unable to reset password right now." });
  } finally {
    client.release();
  }
});

app.post("/api/auth/forgot-email", async (req, res) => {
  const ip = getRequestIp(req);
  const normalizedName = String(req.body?.name || "").trim().replace(/\s+/g, " ").toLowerCase();
  const normalizedBusiness = String(req.body?.businessName || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!consumeRecoveryLimit(`forgot-email-ip:${ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ message: "Too many recovery attempts. Try again later." });
  }
  if (!normalizedName || !normalizedBusiness || normalizedName.length > 200 || normalizedBusiness.length > 200 ||
      !consumeRecoveryLimit(`forgot-email-lookup:${crypto.createHash("sha256").update(`${normalizedName}|${normalizedBusiness}`).digest("hex")}`, 5, 60 * 60 * 1000)) {
    return res.status(400).json({ message: "Enter the account holder name and business name to check for a match." });
  }

  const result = await pool.query(
    `SELECT email FROM users
     WHERE LOWER(REGEXP_REPLACE(BTRIM(name), '\\s+', ' ', 'g')) = $1
       AND LOWER(REGEXP_REPLACE(BTRIM(business_name), '\\s+', ' ', 'g')) = $2
     LIMIT 1`,
    [normalizedName, normalizedBusiness],
  ).catch((error) => {
    console.error("Email recovery lookup failed.", error.message);
    return { rows: [] };
  });
  if (!result.rows[0]) return res.status(404).json({ message: "No matching account details were found." });
  return res.json({ maskedEmail: maskEmail(result.rows[0].email) });
});

app.get("/api/products", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const result = await pool.query(
    `SELECT id, name, category, price, cost_price, quantity, low_stock_threshold
     FROM products WHERE user_id = $1 ORDER BY created_at DESC`,
    [currentUser.id],
  );

  return res.json({
    products: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      costPrice: row.cost_price === null ? null : Number(row.cost_price),
      quantity: row.quantity,
      lowStockThreshold: row.low_stock_threshold,
    })),
  });
});

app.post("/api/products", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const { name, category, price, sellingPrice, costPrice, quantity, lowStockThreshold } = req.body || {};
  const parsedSellingPrice = Number(sellingPrice ?? price);
  const parsedCostPrice = costPrice === null || costPrice === "" || costPrice === undefined ? null : Number(costPrice);
  const parsedQuantity = Number(quantity);
  const parsedThreshold = Number(lowStockThreshold ?? 5);

  if (!String(name || "").trim() || !Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0 || (parsedCostPrice !== null && (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0)) || !Number.isInteger(parsedQuantity) || parsedQuantity < 0 || !Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
    return res.status(400).json({ message: "Valid product name, selling price, cost price, quantity, and low-stock threshold are required." });
  }

  const result = await pool.query(
    `INSERT INTO products (id, user_id, name, category, price, cost_price, quantity, low_stock_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, category, price, cost_price, quantity, low_stock_threshold`,
    [crypto.randomUUID(), currentUser.id, String(name).trim(), String(category || "General").trim() || "General", parsedSellingPrice, parsedCostPrice, parsedQuantity, parsedThreshold],
  );
  const product = result.rows[0];
  return res.status(201).json({
    product: { id: product.id, name: product.name, category: product.category, price: Number(product.price), costPrice: product.cost_price === null ? null : Number(product.cost_price), quantity: product.quantity, lowStockThreshold: product.low_stock_threshold },
  });
});

app.put("/api/products/:id", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const { name, category, price, sellingPrice, costPrice, quantity, lowStockThreshold } = req.body || {};
  const parsedPrice = Number(sellingPrice ?? price);
  const parsedCostPrice = costPrice === null || costPrice === "" || costPrice === undefined ? null : Number(costPrice);
  const parsedQuantity = Number(quantity);
  const parsedThreshold = Number(lowStockThreshold ?? 5);
  if (!String(name || "").trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || (parsedCostPrice !== null && (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0)) || !Number.isInteger(parsedQuantity) || parsedQuantity < 0 || !Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
    return res.status(400).json({ message: "Invalid product values." });
  }

  const result = await pool.query(
    `UPDATE products SET name = $1, category = $2, price = $3, cost_price = $4, quantity = $5,
       low_stock_threshold = $6, updated_at = NOW()
    WHERE id = $7 AND user_id = $8
     RETURNING id, name, category, price, cost_price, quantity, low_stock_threshold`,
    [String(name).trim(), String(category || "General").trim() || "General", parsedPrice, parsedCostPrice, parsedQuantity, parsedThreshold, req.params.id, currentUser.id],
  );
  if (!result.rows[0]) return res.status(404).json({ message: "Product not found." });
  const product = result.rows[0];
  return res.json({ product: { id: product.id, name: product.name, category: product.category, price: Number(product.price), costPrice: product.cost_price === null ? null : Number(product.cost_price), quantity: product.quantity, lowStockThreshold: product.low_stock_threshold } });
});

app.post("/api/products/:id/restock", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const amount = Number(req.body?.amount ?? 1);
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ message: "Restock amount must be a positive whole number." });

  const result = await pool.query(
    `UPDATE products SET quantity = quantity + $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
    RETURNING id, name, category, price, cost_price, quantity, low_stock_threshold`,
    [amount, req.params.id, currentUser.id],
  );
  if (!result.rows[0]) return res.status(404).json({ message: "Product not found." });
  const product = result.rows[0];
  return res.json({ product: { ...product, price: Number(product.price), lowStockThreshold: product.low_stock_threshold } });
});

app.post("/api/sales", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ message: "At least one sale item is required." });

  const quantities = new Map();
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!item.productId || !Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: "Sale quantities must be positive whole numbers." });
    quantities.set(String(item.productId), (quantities.get(String(item.productId)) || 0) + quantity);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const productIds = [...quantities.keys()];
    const result = await client.query(
      `SELECT id, name, price, cost_price, quantity FROM products
       WHERE user_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`,
      [currentUser.id, productIds],
    );
    if (result.rows.length !== productIds.length) throw new Error("One or more products were not found.");

    let subtotal = 0;
    let totalCost = 0;
    const lineItems = result.rows.map((product) => {
      const quantity = quantities.get(String(product.id));
      if (product.quantity < quantity) throw new Error(`Insufficient stock for ${product.name}.`);
      subtotal += Number(product.price) * quantity;
      const costPrice = product.cost_price === null ? 0 : Number(product.cost_price);
      const profit = (Number(product.price) - costPrice) * quantity;
      totalCost += costPrice * quantity;
      return { product, quantity, costPrice, profit };
    });
    const tax = Number((subtotal * 0.08).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
    const saleId = crypto.randomUUID();
    const reference = `TRX-${Date.now().toString().slice(-8)}`;
    const saleResult = await client.query(
      `INSERT INTO sales (id, user_id, reference, customer, payment_method, subtotal, tax, total, total_cost, total_profit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, reference, customer, payment_method, subtotal, tax, total, total_cost, total_profit, created_at`,
      [saleId, currentUser.id, reference, String(req.body.customer || "Walk-in Customer"), String(req.body.paymentMethod || "Cash"), subtotal, tax, total, totalCost, subtotal - totalCost],
    );

    for (const { product, quantity, costPrice, profit } of lineItems) {
      await client.query(
        `UPDATE products SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
        [quantity, product.id, currentUser.id],
      );
      await client.query(
        `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, cost_price, profit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [crypto.randomUUID(), saleId, product.id, product.name, quantity, product.price, costPrice, profit],
      );
    }

    await client.query("COMMIT");
    const sale = saleResult.rows[0];
    return res.status(201).json({ sale: { ...sale, subtotal: Number(sale.subtotal), tax: Number(sale.tax), total: Number(sale.total), totalCost: Number(sale.total_cost), totalProfit: Number(sale.total_profit) } });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to complete sale." });
  } finally {
    client.release();
  }
});

app.get("/api/sales", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const result = await pool.query(
    `SELECT id, reference, customer, payment_method, subtotal, tax, total, total_cost, total_profit, created_at
     FROM sales WHERE user_id = $1 ORDER BY created_at DESC`,
    [currentUser.id],
  );
  return res.json({ sales: result.rows.map((sale) => ({
    id: sale.id,
    reference: sale.reference,
    customer: sale.customer,
    payment: sale.payment_method,
    total: Number(sale.total),
    totalCost: Number(sale.total_cost),
    totalProfit: Number(sale.total_profit),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    createdAt: sale.created_at,
  })) });
});

app.get("/api/reports/summary", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const totals = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(total_cost), 0) AS cost, COALESCE(SUM(total_profit), 0) AS profit, COUNT(*)::int AS transactions
     FROM sales WHERE user_id = $1`,
    [currentUser.id],
  );
  const topProducts = await pool.query(
    `SELECT product_name AS name, SUM(quantity)::int AS quantity, SUM(quantity * unit_price) AS value, SUM(profit) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.user_id = $1 GROUP BY product_name ORDER BY value DESC LIMIT 5`,
    [currentUser.id],
  );
  const lossTotals = await pool.query(
    `SELECT
       COALESCE(SUM(loss_amount), 0) AS total,
       COALESCE(SUM(loss_amount) FILTER (WHERE loss_date = CURRENT_DATE), 0) AS today,
       COALESCE(SUM(loss_amount) FILTER (WHERE loss_date >= DATE_TRUNC('week', CURRENT_DATE)::date), 0) AS this_week,
       COALESCE(SUM(loss_amount) FILTER (WHERE loss_date >= DATE_TRUNC('month', CURRENT_DATE)::date), 0) AS this_month,
       COUNT(*)::int AS transactions
     FROM inventory_losses
     WHERE business_user_id = $1`,
    [currentUser.id],
  );
  const topLossProducts = await pool.query(
    `SELECT product_name AS name, SUM(quantity)::int AS quantity, SUM(loss_amount) AS amount
     FROM inventory_losses
     WHERE business_user_id = $1
     GROUP BY product_name
     ORDER BY amount DESC
     LIMIT 5`,
    [currentUser.id],
  );
  const lossTrend = await pool.query(
    `SELECT loss_date AS date, SUM(loss_amount) AS amount
     FROM inventory_losses
     WHERE business_user_id = $1 AND loss_date >= CURRENT_DATE - INTERVAL '13 days'
     GROUP BY loss_date
     ORDER BY loss_date ASC`,
    [currentUser.id],
  );
  const grossProfit = Number(totals.rows[0]?.profit || 0);
  const inventoryLosses = Number(lossTotals.rows[0]?.total || 0);
  return res.json({
    revenue: Number(totals.rows[0]?.revenue || 0),
    cost: Number(totals.rows[0]?.cost || 0),
    grossProfit,
    inventoryLosses,
    profit: Number((grossProfit - inventoryLosses).toFixed(2)),
    transactions: Number(totals.rows[0]?.transactions || 0),
    topProducts: topProducts.rows.map((product) => ({ name: product.name, quantity: product.quantity, value: Number(product.value), profit: Number(product.profit) })),
    lossSummary: {
      total: inventoryLosses,
      today: Number(lossTotals.rows[0]?.today || 0),
      thisWeek: Number(lossTotals.rows[0]?.this_week || 0),
      thisMonth: Number(lossTotals.rows[0]?.this_month || 0),
      transactions: Number(lossTotals.rows[0]?.transactions || 0),
      topProducts: topLossProducts.rows.map((product) => ({ name: product.name, quantity: product.quantity, amount: Number(product.amount) })),
      trend: lossTrend.rows.map((day) => ({ date: formatDateOnly(day.date), amount: Number(day.amount) })),
    },
  });
});

app.post("/api/losses", async (req, res) => {
  const currentUser = requireBusinessSession(req, res);
  if (!currentUser) return;

  const productId = req.body?.productId;
  const quantity = Number(req.body?.quantity);
  const reason = String(req.body?.reason || "").trim();
  const lossDate = req.body?.date;
  const notes = String(req.body?.notes || "").trim();
  if (!isValidUuid(productId)) return res.status(400).json({ message: "Select a valid product." });
  if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: "Quantity lost must be a positive whole number." });
  if (!LOSS_REASONS.has(reason)) return res.status(400).json({ message: "Select a valid loss reason." });
  if (!isValidDateOnly(lossDate)) return res.status(400).json({ message: "Enter a valid loss date." });
  if (notes.length > 1000) return res.status(400).json({ message: "Notes must be 1000 characters or fewer." });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const productResult = await client.query(
      `SELECT products.id, products.name, products.cost_price, products.quantity, users.business_name
       FROM products
       JOIN users ON users.id = products.user_id
       WHERE products.id = $1 AND products.user_id = $2
       FOR UPDATE OF products`,
      [productId, currentUser.id],
    );
    const product = productResult.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Product not found." });
    }
    if (product.cost_price === null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Set a cost price for this product before recording a loss." });
    }
    if (quantity > product.quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient stock. You cannot record a loss greater than the available stock." });
    }

    const updatedProduct = await client.query(
      `UPDATE products SET quantity = quantity - $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, quantity`,
      [quantity, productId, currentUser.id],
    );
    const lossResult = await client.query(
      `INSERT INTO inventory_losses
         (id, product_id, business_user_id, product_name, business_name, quantity, cost_price, loss_amount, reason, notes, loss_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7::numeric * $6::integer::numeric, $8, $9, $10::date)
       RETURNING id, product_id, product_name, quantity, cost_price, loss_amount, reason, notes, loss_date, created_at`,
      [crypto.randomUUID(), product.id, currentUser.id, product.name, product.business_name, quantity, product.cost_price, reason, notes || null, lossDate],
    );
    await client.query("COMMIT");
    return res.status(201).json({ loss: mapInventoryLoss(lossResult.rows[0]), product: { id: product.id, quantity: updatedProduct.rows[0].quantity } });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const connectionError = isDatabaseConnectionError(error);
    console.error("Inventory loss creation failed.", connectionError ? "Database connection unavailable." : error.message);
    return res.status(connectionError ? 503 : 500).json({
      message: connectionError ? "Database connection timed out. Check the API database connection and retry." : "Unable to record this inventory loss.",
    });
  } finally {
    client?.release();
  }
});

app.get("/api/losses", async (req, res) => {
  const currentUser = requireBusinessSession(req, res);
  if (!currentUser) return;

  const { from, to, productId, reason } = req.query;
  if ((from !== undefined && !isValidDateOnly(from)) || (to !== undefined && !isValidDateOnly(to))) {
    return res.status(400).json({ message: "Use valid YYYY-MM-DD dates for the loss date range." });
  }
  if (from && to && from > to) return res.status(400).json({ message: "The start date must not be after the end date." });
  if (productId !== undefined && !isValidUuid(productId)) return res.status(400).json({ message: "Select a valid product filter." });
  if (reason !== undefined && !LOSS_REASONS.has(reason)) return res.status(400).json({ message: "Select a valid loss reason filter." });

  const conditions = ["business_user_id = $1"];
  const values = [currentUser.id];
  if (from) {
    values.push(from);
    conditions.push(`loss_date >= $${values.length}::date`);
  }
  if (to) {
    values.push(to);
    conditions.push(`loss_date <= $${values.length}::date`);
  }
  if (productId) {
    values.push(productId);
    conditions.push(`product_id = $${values.length}`);
  }
  if (reason) {
    values.push(reason);
    conditions.push(`reason = $${values.length}`);
  }
  const result = await pool.query(
    `SELECT id, product_id, product_name, quantity, cost_price, loss_amount, reason, notes, loss_date, created_at
     FROM inventory_losses
     WHERE ${conditions.join(" AND ")}
     ORDER BY loss_date DESC, created_at DESC`,
    values,
  );
  return res.json({ losses: result.rows.map(mapInventoryLoss) });
});

app.get("/api/losses/:id", async (req, res) => {
  const currentUser = requireBusinessSession(req, res);
  if (!currentUser) return;
  if (!isValidUuid(req.params.id)) return res.status(400).json({ message: "A valid loss id is required." });

  const result = await pool.query(
    `SELECT id, product_id, product_name, quantity, cost_price, loss_amount, reason, notes, loss_date, created_at
     FROM inventory_losses
     WHERE id = $1 AND business_user_id = $2`,
    [req.params.id, currentUser.id],
  );
  if (!result.rows[0]) return res.status(404).json({ message: "Loss record not found." });
  return res.json({ loss: mapInventoryLoss(result.rows[0]) });
});

app.delete("/api/losses/:id", async (req, res) => {
  const currentUser = requireBusinessSession(req, res);
  if (!currentUser) return;
  if (!isValidUuid(req.params.id)) return res.status(400).json({ message: "A valid loss id is required." });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const lossResult = await client.query(
      `SELECT id, product_id, quantity
       FROM inventory_losses
       WHERE id = $1 AND business_user_id = $2
       FOR UPDATE`,
      [req.params.id, currentUser.id],
    );
    const loss = lossResult.rows[0];
    if (!loss) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Loss record not found." });
    }

    let restoredQuantity = null;
    if (loss.product_id) {
      const productResult = await client.query(
        `UPDATE products SET quantity = quantity + $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING quantity`,
        [loss.quantity, loss.product_id, currentUser.id],
      );
      if (!productResult.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "The product no longer exists, so its stock cannot be restored." });
      }
      restoredQuantity = productResult.rows[0].quantity;
    }
    await client.query("DELETE FROM inventory_losses WHERE id = $1 AND business_user_id = $2", [loss.id, currentUser.id]);
    await client.query("COMMIT");
    return res.json({ message: "Loss record deleted.", productId: loss.product_id, restoredQuantity });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const connectionError = isDatabaseConnectionError(error);
    console.error("Inventory loss deletion failed.", connectionError ? "Database connection unavailable." : error.message);
    return res.status(connectionError ? 503 : 500).json({
      message: connectionError ? "Database connection timed out. Check the API database connection and retry." : "Unable to delete this inventory loss.",
    });
  } finally {
    client?.release();
  }
});

app.get("/api/reports/sales.csv", async (req, res) => {
  const currentUser = requireSession(req, res);
  if (!currentUser) return;

  const result = await pool.query(
    `SELECT reference, customer, payment_method, subtotal, tax, total, created_at
     FROM sales WHERE user_id = $1 ORDER BY created_at DESC`,
    [currentUser.id],
  );
  const rows = ["Reference,Customer,Payment Method,Subtotal,Tax,Total,Created At"];
  for (const sale of result.rows) {
    const values = [sale.reference, sale.customer, sale.payment_method, sale.subtotal, sale.tax, sale.total, sale.created_at.toISOString()];
    rows.push(values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  }
  res.header("Content-Type", "text/csv; charset=utf-8");
  res.header("Content-Disposition", "attachment; filename=spazakeep-sales.csv");
  return res.send(rows.join("\n"));
});

app.get("/api/admin/dashboard", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const currentUser = sessions.get(token);
  if (currentUser.role !== "admin") {
    return res.status(403).json({ message: "Only the admin can access this dashboard." });
  }

  const metricsResult = await pool.query(`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_users,
      COUNT(*) FILTER (WHERE role = 'business_user')::int AS business_users,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS recent_users
    FROM users
  `);

  const recentResult = await pool.query(
    "SELECT id, name, email, business_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5",
  );

  const insights = metricsResult.rows[0] || {};

  return res.json({
    stats: {
      totalUsers: Number(insights.total_users || 0),
      adminUsers: Number(insights.admin_users || 0),
      businessUsers: Number(insights.business_users || 0),
      recentUsers: Number(insights.recent_users || 0),
    },
    recent: recentResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      businessName: row.business_name,
      role: row.role || "business_user",
      createdAt: row.created_at,
    })),
  });
});

app.get("/api/admin/users", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const currentUser = sessions.get(token);
  if (currentUser.role !== "admin") {
    return res.status(403).json({ message: "Only the admin can manage users." });
  }

  const result = await pool.query(
    "SELECT id, name, email, business_name, business_tagline, role, created_at FROM users ORDER BY created_at DESC",
  );

  return res.json({
    users: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      businessName: row.business_name,
      businessTagline: row.business_tagline,
      role: row.role || "business_user",
      createdAt: row.created_at,
    })),
  });
});

app.put("/api/admin/users/:id", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const currentUser = sessions.get(token);
  if (currentUser.role !== "admin") {
    return res.status(403).json({ message: "Only the admin can manage users." });
  }

  const { id } = req.params || {};
  const { name, businessName, businessTagline } = req.body || {};
  const safeName = String(name || "").trim();
  const safeBusinessName = String(businessName || "").trim();
  const safeBusinessTagline = String(businessTagline || "").trim();

  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ message: "A valid user id is required." });
  }
  if (!safeName || !safeBusinessName || !safeBusinessTagline) {
    return res.status(400).json({ message: "Name, business name, and business tagline are required." });
  }

  const result = await pool.query(
    `UPDATE users AS target
     SET name = $1, business_name = $2, business_tagline = $3
     WHERE target.id = $4 AND target.role <> 'admin'
     RETURNING target.id, target.name, target.email, target.business_name, target.business_tagline, target.role, target.created_at`,
    [safeName, safeBusinessName, safeBusinessTagline, id],
  );

  if (!result.rows[0]) {
    const exists = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
    if (!exists.rows[0]) return res.status(404).json({ message: "User not found." });
    return res.status(400).json({ message: exists.rows[0].role === "admin" ? "Admin accounts cannot be edited here." : "User could not be updated." });
  }

  const user = result.rows[0];
  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      businessName: user.business_name,
      businessTagline: user.business_tagline,
      role: user.role || "business_user",
      createdAt: user.created_at,
    },
  });
});

app.delete("/api/admin/users/:id", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const currentUser = sessions.get(token);
  if (currentUser.role !== "admin") {
    return res.status(403).json({ message: "Only the admin can manage users." });
  }

  const { id } = req.params || {};
  if (!id) {
    return res.status(400).json({ message: "User id is required." });
  }

  const result = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
  const targetUser = result.rows[0];

  if (!targetUser) {
    return res.status(404).json({ message: "User not found." });
  }

  if (targetUser.role === "admin") {
    return res.status(400).json({ message: "Admin accounts cannot be removed." });
  }

  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  return res.json({ message: "User removed successfully." });
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = sessions.get(token);
  return res.json({ user: sanitizeUser(user) });
});

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Database initialization failed:", error);
      process.exit(1);
    });
}

module.exports = { app: appInstance, pool, initializeDatabase, setEmailTransportForTests };