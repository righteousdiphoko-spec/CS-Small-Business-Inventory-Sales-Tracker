require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;
const API_ORIGIN = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || "http://localhost:3000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ADMIN_EMAIL = "admin@spazakeep.co.za";

const sessions = new Map();

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", API_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
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

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, business_name, business_tagline, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO NOTHING`,
    [crypto.randomUUID(), "Demo Admin", ADMIN_EMAIL, hashPassword("admin123"), "Demo Admin Store", "A small business", "admin"],
  );
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
  const role = normalizedEmail === ADMIN_EMAIL ? "admin" : "business_user";

  if (normalizedEmail.length < 3 || String(password).length < 6) {
    return res.status(400).json({ message: "Email is invalid or password is too short." });
  }

  try {
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
    "SELECT id, name, email, password_hash, business_name, business_tagline, role, created_at FROM users WHERE email = $1",
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

app.post("/api/admin/users", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const currentUser = sessions.get(token);
  if (currentUser.role !== "admin") {
    return res.status(403).json({ message: "Only the admin can create users." });
  }

  const { name, email, password, businessName, businessTagline } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const safeBusinessName = String(businessName || name).trim() || "SpazaKeep";
  const safeBusinessTagline = String(businessTagline || "A small business").trim() || "A small business";

  if (normalizedEmail.length < 3 || String(password).length < 6) {
    return res.status(400).json({ message: "Email is invalid or password is too short." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (id, name, email, password_hash, business_name, business_tagline, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, business_name, business_tagline, role, created_at`,
      [
        crypto.randomUUID(),
        String(name).trim(),
        normalizedEmail,
        hashPassword(String(password)),
        safeBusinessName,
        safeBusinessTagline,
        "business_user",
      ],
    );

    const createdUser = result.rows[0];
    return res.status(201).json({
      user: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        businessName: createdUser.business_name,
        businessTagline: createdUser.business_tagline,
        role: createdUser.role || "business_user",
        createdAt: createdUser.created_at,
      },
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    console.error("Admin user creation failed:", error);
    return res.status(500).json({ message: "Unable to create the user." });
  }
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

  const result = await pool.query("SELECT id, email FROM users WHERE id = $1", [id]);
  const targetUser = result.rows[0];

  if (!targetUser) {
    return res.status(404).json({ message: "User not found." });
  }

  if (String(targetUser.email).toLowerCase() === ADMIN_EMAIL) {
    return res.status(400).json({ message: "The admin user cannot be removed." });
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