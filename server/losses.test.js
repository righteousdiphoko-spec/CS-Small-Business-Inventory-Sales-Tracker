require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("Inventory loss integration tests require TEST_DATABASE_URL. Configure it with a disposable PostgreSQL database before running npm test.");
}

function getDatabaseIdentity(connectionString) {
  const url = new URL(connectionString);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`.toLowerCase();
}

if (!applicationDatabaseUrl || getDatabaseIdentity(testDatabaseUrl) === getDatabaseIdentity(applicationDatabaseUrl)) {
  throw new Error("TEST_DATABASE_URL must identify a disposable database different from DATABASE_URL.");
}

process.env.DATABASE_URL = testDatabaseUrl;
const { app, pool, initializeDatabase } = require("./injex");

test("loss recording is transactional, owner-scoped, cost-based, and excluded from sales", { timeout: 120_000 }, async (context) => {
  await initializeDatabase();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const userIds = [];
  const lossIds = [];

  context.after(async () => {
    if (lossIds.length) await pool.query("DELETE FROM inventory_losses WHERE id = ANY($1::uuid[])", [lossIds]);
    if (userIds.length) {
      await pool.query("DELETE FROM sales WHERE user_id = ANY($1::uuid[])", [userIds]);
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
    }
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  });

  const request = async (path, { token, method = "GET", body } = {}) => fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const signup = async (name, email) => {
    const response = await request("/api/auth/signup", {
      method: "POST",
      body: { name, email, password: "InventoryTest123", businessName: `${name} Business`, businessTagline: "Test shop" },
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    userIds.push(data.user.id);
    return data;
  };

  const createProduct = async (token, values) => {
    const response = await request("/api/products", { token, method: "POST", body: values });
    return { response, data: await response.json() };
  };

  const firstBusiness = await signup("Loss Owner One", `loss-one-${suffix}@example.test`);
  const secondBusiness = await signup("Loss Owner Two", `loss-two-${suffix}@example.test`);
  const platformAdmin = await signup("Platform Administrator", `loss-admin-${suffix}@example.test`);
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [platformAdmin.user.id]);
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: `loss-admin-${suffix}@example.test`, password: "InventoryTest123" },
  });
  assert.equal(adminLogin.status, 200);
  const platformAdminSession = await adminLogin.json();

  assert.equal((await request("/api/losses")).status, 401);
  assert.equal((await request("/api/losses", { token: platformAdminSession.token })).status, 403);

  const milkResult = await createProduct(firstBusiness.token, {
    name: "Milk",
    category: "Groceries",
    price: 30,
    costPrice: 10,
    quantity: 20,
    lowStockThreshold: 5,
  });
  assert.equal(milkResult.response.status, 201);
  const milk = milkResult.data.product;

  const saleProductResult = await createProduct(firstBusiness.token, {
    name: "Coffee",
    category: "Groceries",
    price: 100,
    costPrice: 60,
    quantity: 10,
    lowStockThreshold: 2,
  });
  assert.equal(saleProductResult.response.status, 201);
  const saleProduct = saleProductResult.data.product;
  const saleResponse = await request("/api/sales", {
    token: firstBusiness.token,
    method: "POST",
    body: { items: [{ productId: saleProduct.id, quantity: 5 }] },
  });
  assert.equal(saleResponse.status, 201);
  const saleData = await saleResponse.json();
  assert.equal(saleData.sale.totalCost, 300);
  assert.equal(saleData.sale.totalProfit, 200);

  const createLoss = async (values) => {
    const response = await request("/api/losses", { token: firstBusiness.token, method: "POST", body: values });
    const data = await response.json();
    if (response.ok && data.loss) lossIds.push(data.loss.id);
    return { response, data };
  };

  const firstLossResult = await createLoss({ productId: milk.id, quantity: 5, reason: "Expired", date: "2026-09-28", notes: "Expired before sale" });
  assert.equal(firstLossResult.response.status, 201);
  assert.equal(firstLossResult.data.loss.costPrice, 10);
  assert.equal(firstLossResult.data.loss.lossAmount, 50);
  assert.equal(firstLossResult.data.loss.date, "2026-09-28");
  assert.equal(firstLossResult.data.product.quantity, 15);

  const originalConnect = pool.connect;
  pool.connect = async () => {
    const error = new Error("Simulated database connection timeout");
    error.code = "ETIMEDOUT";
    throw error;
  };
  try {
    const timeoutResponse = await createLoss({ productId: milk.id, quantity: 1, reason: "Damaged", date: "2026-09-29" });
    assert.equal(timeoutResponse.response.status, 503);
    assert.match(timeoutResponse.response.headers.get("content-type"), /application\/json/);
    assert.match(timeoutResponse.data.message, /Database connection timed out/);
  } finally {
    pool.connect = originalConnect;
  }

  const summaryResponse = await request("/api/reports/summary", { token: firstBusiness.token });
  const summary = await summaryResponse.json();
  assert.equal(summary.grossProfit, 200);
  assert.equal(summary.inventoryLosses, 50);
  assert.equal(summary.profit, 150);
  assert.equal(summary.transactions, 1);
  assert.equal(summary.lossSummary.transactions, 1);

  const insufficient = await createLoss({ productId: milk.id, quantity: 16, reason: "Damaged", date: "2026-09-29" });
  assert.equal(insufficient.response.status, 400);
  assert.equal(insufficient.data.message, "Insufficient stock. You cannot record a loss greater than the available stock.");
  assert.equal((await pool.query("SELECT quantity FROM products WHERE id = $1", [milk.id])).rows[0].quantity, 15);
  assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM inventory_losses WHERE business_user_id = $1", [firstBusiness.user.id])).rows[0].count), 1);

  for (const invalid of [
    { productId: milk.id, quantity: 0, reason: "Damaged", date: "2026-09-29" },
    { productId: milk.id, quantity: -1, reason: "Damaged", date: "2026-09-29" },
    { productId: milk.id, quantity: 1, reason: "", date: "2026-09-29" },
    { productId: milk.id, quantity: 1, reason: "Damaged", date: "2026-02-30" },
    { productId: "not-a-uuid", quantity: 1, reason: "Damaged", date: "2026-09-29" },
  ]) {
    assert.equal((await createLoss(invalid)).response.status, 400);
  }
  assert.equal((await createLoss({ productId: crypto.randomUUID(), quantity: 1, reason: "Damaged", date: "2026-09-29" })).response.status, 404);

  const noCostResult = await createProduct(firstBusiness.token, {
    name: "Uncosted Product",
    category: "General",
    price: 20,
    costPrice: null,
    quantity: 3,
    lowStockThreshold: 1,
  });
  assert.equal(noCostResult.response.status, 201);
  const noCostLoss = await createLoss({ productId: noCostResult.data.product.id, quantity: 1, reason: "Other", date: "2026-09-29" });
  assert.equal(noCostLoss.response.status, 400);
  const negativeCost = await createProduct(firstBusiness.token, {
    name: "Negative Cost Product",
    category: "General",
    price: 20,
    costPrice: -1,
    quantity: 3,
    lowStockThreshold: 1,
  });
  assert.equal(negativeCost.response.status, 400);

  const secondLossResult = await createLoss({ productId: milk.id, quantity: 1, reason: "Damaged", date: "2026-09-30" });
  assert.equal(secondLossResult.response.status, 201);
  const secondLoss = secondLossResult.data.loss;
  const filteredByDate = await request("/api/losses?from=2026-09-30&to=2026-09-30", { token: firstBusiness.token });
  assert.equal((await filteredByDate.json()).losses.length, 1);
  const filteredByProduct = await request(`/api/losses?productId=${milk.id}`, { token: firstBusiness.token });
  const productLosses = (await filteredByProduct.json()).losses;
  assert.equal(productLosses.length, 2);
  assert.equal(productLosses[0].id, secondLoss.id);
  const filteredByReason = await request("/api/losses?reason=Expired", { token: firstBusiness.token });
  assert.equal((await filteredByReason.json()).losses.length, 1);
  assert.equal((await request("/api/losses?from=2026-10-01&to=2026-09-30", { token: firstBusiness.token })).status, 400);

  const secondMilkResult = await createProduct(secondBusiness.token, {
    name: "Milk",
    category: "Groceries",
    price: 30,
    costPrice: 12,
    quantity: 8,
    lowStockThreshold: 2,
  });
  assert.equal(secondMilkResult.response.status, 201);
  const secondMilk = secondMilkResult.data.product;
  const crossBusinessLoss = await request("/api/losses", {
    token: firstBusiness.token,
    method: "POST",
    body: { productId: secondMilk.id, quantity: 1, reason: "Lost", date: "2026-09-30" },
  });
  assert.equal(crossBusinessLoss.status, 404);
  const secondBusinessLoss = await request("/api/losses", {
    token: secondBusiness.token,
    method: "POST",
    body: { productId: secondMilk.id, quantity: 1, reason: "Lost", date: "2026-09-30" },
  });
  assert.equal(secondBusinessLoss.status, 201);
  const secondBusinessLossData = await secondBusinessLoss.json();
  lossIds.push(secondBusinessLossData.loss.id);

  assert.equal((await request("/api/losses", { token: secondBusiness.token })).status, 200);
  assert.equal((await (await request("/api/losses", { token: secondBusiness.token })).json()).losses.length, 1);
  assert.equal((await request(`/api/losses/${firstLossResult.data.loss.id}`, { token: secondBusiness.token })).status, 404);
  assert.equal((await request(`/api/losses/${secondBusinessLossData.loss.id}`, { token: firstBusiness.token, method: "DELETE" })).status, 404);

  const deleted = await request(`/api/losses/${firstLossResult.data.loss.id}`, { token: firstBusiness.token, method: "DELETE" });
  assert.equal(deleted.status, 200);
  const deletedData = await deleted.json();
  assert.equal(deletedData.restoredQuantity, 19);
  const afterDeleteQuantity = await pool.query("SELECT quantity FROM products WHERE id = $1", [milk.id]);
  assert.equal(afterDeleteQuantity.rows[0].quantity, 19);
  assert.equal((await request(`/api/losses/${firstLossResult.data.loss.id}`, { token: firstBusiness.token, method: "DELETE" })).status, 404);
  assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM sales WHERE user_id = $1", [firstBusiness.user.id])).rows[0].count), 1);
  assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM sale_items WHERE sale_id = $1", [saleData.sale.id])).rows[0].count), 1);

  const finalLossDelete = await request(`/api/losses/${secondLoss.id}`, { token: firstBusiness.token, method: "DELETE" });
  assert.equal(finalLossDelete.status, 200);
  assert.equal((await finalLossDelete.json()).restoredQuantity, 20);
  assert.equal((await pool.query("SELECT quantity FROM products WHERE id = $1", [milk.id])).rows[0].quantity, 20);
  assert.equal((await request(`/api/losses/${secondLoss.id}`, { token: firstBusiness.token, method: "DELETE" })).status, 404);
});