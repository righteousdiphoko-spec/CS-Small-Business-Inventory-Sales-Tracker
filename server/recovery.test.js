require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("Password recovery integration tests require TEST_DATABASE_URL. Configure it with a disposable PostgreSQL database before running npm test.");
}

function getDatabaseIdentity(connectionString) {
  const url = new URL(connectionString);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`.toLowerCase();
}

if (!applicationDatabaseUrl || getDatabaseIdentity(testDatabaseUrl) === getDatabaseIdentity(applicationDatabaseUrl)) {
  throw new Error("TEST_DATABASE_URL must identify a disposable database different from DATABASE_URL.");
}

process.env.DATABASE_URL = testDatabaseUrl;
const { app, pool, initializeDatabase, setEmailTransportForTests } = require("./injex");

test("password and email recovery are private, rate limited, expiring, and one-time", async (context) => {
    await initializeDatabase();
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const testEmail = `recovery-${Date.now()}@example.test`;
    const deliveryFailureEmail = `delivery-${Date.now()}@example.test`;
    const userIds = [];
    const sentEmails = [];
    const attemptedEmails = [];
    let failureMode = null;
    const originalPublicAppUrl = process.env.PUBLIC_APP_URL;
    const originalEmailFrom = process.env.EMAIL_FROM;
    process.env.PUBLIC_APP_URL = origin;
    process.env.EMAIL_FROM = "SpazaKeep Tests <noreply@example.test>";
    setEmailTransportForTests({
      async sendMail(message) {
        attemptedEmails.push(message);
        if (failureMode === "reset" && message.subject === "Reset your SpazaKeep password") {
          throw Object.assign(new Error("mock SMTP failure"), { code: "EAUTH" });
        }
        if (failureMode === "confirmation" && message.subject === "Your SpazaKeep password was changed") {
          throw Object.assign(new Error("mock SMTP failure"), { code: "EAUTH" });
        }
        sentEmails.push(message);
        return { messageId: "mock-message-id" };
      },
    });

    context.after(async () => {
      setEmailTransportForTests(null);
      if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
      if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = originalEmailFrom;
      if (userIds.length) await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await pool.end();
    });

    const signupResponse = await fetch(`${origin}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Recovery Test Person",
        email: testEmail,
        password: "InitialPassword123",
        businessName: "Recovery Test Business",
        businessTagline: "Test account",
      }),
    });
    assert.equal(signupResponse.status, 201);
    const signup = await signupResponse.json();
    userIds.push(signup.user.id);
    const userId = signup.user.id;

    const existingRequest = await fetch(`${origin}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    const existingResponse = await existingRequest.json();
    const absentRequest = await fetch(`${origin}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `absent-${Date.now()}@example.test` }),
    });
    const absentResponse = await absentRequest.json();
    assert.deepEqual(existingResponse, absentResponse);
    assert.match(existingResponse.message, /If an account exists/);
    assert.equal(Object.hasOwn(existingResponse, "token"), false);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, testEmail);
    assert.equal(sentEmails[0].from, process.env.EMAIL_FROM);
    assert.equal(sentEmails[0].subject, "Reset your SpazaKeep password");

    const resetUrl = sentEmails[0].text.match(/https?:\/\/\S+/)?.[0];
    assert.ok(resetUrl, "reset email should contain a secure reset link");
    assert.equal(new URL(resetUrl).origin, origin);
    assert.equal(new URL(resetUrl).pathname, "/");
    assert.equal(new URL(resetUrl).search, "");
    const resetToken = new URLSearchParams(new URL(resetUrl).hash.slice(1)).get("resetToken");
    assert.ok(resetToken);
    assert.match(resetToken, /^[A-Za-z0-9_-]{43}$/);
    const storedToken = await pool.query("SELECT token_hash, expires_at, NOW() AS database_now FROM password_reset_tokens WHERE user_id = $1", [userId]);
    assert.equal(storedToken.rows.length, 1);
    assert.notEqual(storedToken.rows[0].token_hash, resetToken);
    assert.equal(storedToken.rows[0].token_hash, crypto.createHash("sha256").update(resetToken).digest("hex"));
    const tokenExpiryMs = new Date(storedToken.rows[0].expires_at).getTime() - new Date(storedToken.rows[0].database_now).getTime();
    assert.ok(tokenExpiryMs > 29 * 60 * 1000 && tokenExpiryMs <= 30 * 60 * 1000);

    const invalidTokenResponse = await fetch(`${origin}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid-reset-token-value-0123456789", password: "ReplacementPassword456", confirmPassword: "ReplacementPassword456" }),
    });
    assert.equal(invalidTokenResponse.status, 400);
    assert.equal(sentEmails.length, 1);

    const mismatchedPasswordResponse = await fetch(`${origin}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: "ReplacementPassword456", confirmPassword: "DifferentPassword789" }),
    });
    assert.equal(mismatchedPasswordResponse.status, 400);

    const concurrentResetResponses = await Promise.all([
      fetch(`${origin}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: "ReplacementPassword456", confirmPassword: "ReplacementPassword456" }),
      }),
      fetch(`${origin}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: "ReplacementPassword456", confirmPassword: "ReplacementPassword456" }),
      }),
    ]);
    const resetResponse = concurrentResetResponses.find((response) => response.status === 200);
    assert.ok(resetResponse, "one concurrent request should reset the password");
    assert.deepEqual(concurrentResetResponses.map((response) => response.status).sort(), [200, 400]);
    assert.equal(resetResponse.status, 200);
    assert.equal(sentEmails.length, 2);
    assert.equal(sentEmails[1].to, testEmail);
    assert.equal(sentEmails[1].subject, "Your SpazaKeep password was changed");
    assert.doesNotMatch(sentEmails[1].text, /resetToken=/);
    const changedPassword = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    assert.notEqual(changedPassword.rows[0].password_hash, "ReplacementPassword456");
    assert.match(changedPassword.rows[0].password_hash, /^[a-f0-9]+:[a-f0-9]+$/);

    const oldSessionResponse = await fetch(`${origin}/api/auth/me`, {
      headers: { Authorization: `Bearer ${signup.token}` },
    });
    assert.equal(oldSessionResponse.status, 401);

    const reusedTokenResponse = await fetch(`${origin}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: "AnotherPassword789", confirmPassword: "AnotherPassword789" }),
    });
    assert.equal(reusedTokenResponse.status, 400);

    const loginResponse = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "ReplacementPassword456" }),
    });
    assert.equal(loginResponse.status, 200);

    const deliverySignupResponse = await fetch(`${origin}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Delivery Failure Test Person",
        email: deliveryFailureEmail,
        password: "InitialPassword123",
        businessName: "Delivery Failure Test Business",
        businessTagline: "Test account",
      }),
    });
    assert.equal(deliverySignupResponse.status, 201);
    const deliverySignup = await deliverySignupResponse.json();
    userIds.push(deliverySignup.user.id);

    failureMode = "reset";
    const failedDeliveryResponse = await fetch(`${origin}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: deliveryFailureEmail }),
    });
    assert.deepEqual(await failedDeliveryResponse.json(), existingResponse);
    assert.equal(failedDeliveryResponse.status, 200);
    const failedDeliveryToken = await pool.query("SELECT id FROM password_reset_tokens WHERE user_id = $1", [deliverySignup.user.id]);
    assert.equal(failedDeliveryToken.rows.length, 0);

    failureMode = null;
    const confirmationFailureRequest = await fetch(`${origin}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: deliveryFailureEmail }),
    });
    assert.equal(confirmationFailureRequest.status, 200);
    const deliveryResetEmail = sentEmails.find((message) => message.to === deliveryFailureEmail);
    const deliveryResetToken = new URLSearchParams(new URL(deliveryResetEmail.text.match(/https?:\/\/\S+/)[0]).hash.slice(1)).get("resetToken");
    failureMode = "confirmation";
    const confirmationFailureResponse = await fetch(`${origin}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: deliveryResetToken, password: "ReplacementPassword456", confirmPassword: "ReplacementPassword456" }),
    });
    assert.equal(confirmationFailureResponse.status, 200);
    failureMode = null;
    const confirmationFailureLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: deliveryFailureEmail, password: "ReplacementPassword456" }),
    });
    assert.equal(confirmationFailureLogin.status, 200);

    await fetch(`${origin}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    await pool.query("UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1", [userId]);
    const expiredTokenResponse = await fetch(`${origin}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: new URLSearchParams(new URL(sentEmails.filter((message) => message.to === testEmail && message.subject === "Reset your SpazaKeep password").at(-1).text.match(/https?:\/\/\S+/)[0]).hash.slice(1)).get("resetToken"), password: "ExpiredPassword123", confirmPassword: "ExpiredPassword123" }),
    });
    assert.equal(expiredTokenResponse.status, 400);

    const emailLookupResponse = await fetch(`${origin}/api/auth/forgot-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "recovery test person", businessName: "recovery test business" }),
    });
    const emailLookup = await emailLookupResponse.json();
    assert.equal(emailLookupResponse.status, 200);
    assert.match(emailLookup.maskedEmail, /^re\*+@example\.test$/);
    assert.equal(emailLookup.maskedEmail.includes(testEmail), false);

    const mismatchResponse = await fetch(`${origin}/api/auth/forgot-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Recovery Test Person", businessName: "Different Business" }),
    });
    assert.equal(mismatchResponse.status, 404);

    const limitedResponses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${origin}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });
      limitedResponses.push({ status: response.status, body: await response.json() });
    }
    assert.ok(limitedResponses.every((response) => response.status === 200));
    assert.ok(limitedResponses.every((response) => response.body.message === existingResponse.message));
    const primaryResetEmails = sentEmails.filter((message) => message.to === testEmail && message.subject === "Reset your SpazaKeep password");
    assert.equal(primaryResetEmails.length, 3, "email-specific limit should issue at most three reset links per hour");
    assert.equal(attemptedEmails.filter((message) => message.to === deliveryFailureEmail && message.subject === "Your SpazaKeep password was changed").length, 1);
});