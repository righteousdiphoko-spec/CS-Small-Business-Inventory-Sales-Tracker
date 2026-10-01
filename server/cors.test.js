const test = require("node:test");
const assert = require("node:assert/strict");

const originalClientOrigins = process.env.CLIENT_ORIGINS;
const originalClientOrigin = process.env.CLIENT_ORIGIN;
const originalPublicAppUrl = process.env.PUBLIC_APP_URL;
const originalClientUrl = process.env.CLIENT_URL;
process.env.CLIENT_ORIGINS = "https://preview.example.vercel.app";
process.env.CLIENT_ORIGIN = "http://localhost:3000";
process.env.PUBLIC_APP_URL = "https://client-steel.vercel.app";
process.env.CLIENT_URL = "http://localhost:3000";

const { app, pool } = require("./injex");

test("CORS allows configured production origins and rejects unlisted origins", async (context) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  context.after(async () => {
    if (originalClientOrigins === undefined) delete process.env.CLIENT_ORIGINS;
    else process.env.CLIENT_ORIGINS = originalClientOrigins;
    if (originalClientOrigin === undefined) delete process.env.CLIENT_ORIGIN;
    else process.env.CLIENT_ORIGIN = originalClientOrigin;
    if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  });

  const allowedOrigin = "https://client-steel.vercel.app";
  const allowedPreflight = await fetch(`${origin}/api/auth/login`, {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(allowedPreflight.status, 204);
  assert.equal(allowedPreflight.headers.get("access-control-allow-origin"), allowedOrigin);

  const previewOrigin = "https://preview.example.vercel.app";
  const previewPreflight = await fetch(`${origin}/api/auth/login`, {
    method: "OPTIONS",
    headers: { Origin: previewOrigin, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(previewPreflight.status, 204);
  assert.equal(previewPreflight.headers.get("access-control-allow-origin"), previewOrigin);

  const unlistedPreflight = await fetch(`${origin}/api/auth/login`, {
    method: "OPTIONS",
    headers: { Origin: "https://unlisted.example", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(unlistedPreflight.status, 403);
  assert.equal(unlistedPreflight.headers.get("access-control-allow-origin"), null);
});