const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmailService, getSafeSmtpErrorDetails } = require("./email-service");

function createEnvironment(overrides = {}) {
  return {
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-login",
    SMTP_PASS: "test-smtp-key",
    EMAIL_FROM: "no-reply@example.test",
    EMAIL_FROM_NAME: "Small Business Inventory & Sales Tracker",
    ...overrides,
  };
}

test("creates and verifies a generic SMTP transport using configured host and port", async () => {
  let transportOptions;
  let verified = false;
  const emailService = createEmailService({
    env: createEnvironment(),
    transporterFactory(options) {
      transportOptions = options;
      return { async verify() { verified = true; return true; } };
    },
  });

  assert.equal(emailService.isConfigured(), true);
  assert.equal(await emailService.verifyConnection(), true);
  assert.deepEqual(transportOptions, {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: { user: "smtp-login", pass: "test-smtp-key" },
  });
  assert.equal(verified, true);
});

test("accepts a Gmail-style sender address with a display name", () => {
  const emailService = createEmailService({
    env: createEnvironment({ EMAIL_FROM: "Small Business Inventory & Sales Tracker <oreatlile53@gmail.com>" }),
    transporterFactory() {
      return { async verify() { return true; } };
    },
  });

  assert.equal(emailService.isConfigured(), true);
  assert.equal(emailService.getTestEmailDiagnostics("user@example.test").senderEmail, "oreatlile53@gmail.com");
});

test("rejects missing SMTP configuration", async () => {
  let transporterCreated = false;
  const createService = (env) => createEmailService({
    env,
    transporterFactory() {
      transporterCreated = true;
      return { async verify() { return true; } };
    },
  });

  const missingCredentials = createService(createEnvironment({ SMTP_PASS: "" }));
  assert.equal(missingCredentials.isConfigured(), false);
  await assert.rejects(missingCredentials.verifyConnection(), /SMTP_USER and SMTP_PASS/);

  const missingHost = createService(createEnvironment({ SMTP_HOST: "" }));
  assert.equal(missingHost.isConfigured(), false);
  await assert.rejects(missingHost.verifyConnection(), /SMTP_HOST/);
  assert.equal(transporterCreated, false);
});

test("sends branded reset and password-change emails with text and HTML bodies", async () => {
  const messages = [];
  const emailService = createEmailService({
    env: createEnvironment(),
    transporterFactory() {
      return { async sendMail(message) { messages.push(message); return { accepted: [message.to] }; } };
    },
  });

  const resetUrl = "https://app.example.test/#resetToken=single-use-token";
  await emailService.sendPasswordResetEmail("user@example.test", resetUrl);
  await emailService.sendPasswordChangedEmail("user@example.test");

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0].from, {
    name: "Small Business Inventory & Sales Tracker",
    address: "no-reply@example.test",
  });
  assert.equal(messages[0].subject, "Reset your password - Small Business Inventory & Sales Tracker");
  assert.match(messages[0].text, /30 minutes/);
  assert.match(messages[0].text, /did not request this reset/);
  assert.match(messages[0].text, new RegExp(resetUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(messages[0].html, /<a href=/);
  assert.match(messages[0].html, /30 minutes/);
  assert.match(messages[1].subject, /Your password has been changed/);
  assert.match(messages[1].text, /contact your administrator or support/);
  assert.match(messages[1].html, /Password changed/);
});

test("SMTP error details exclude credentials and provider response text", () => {
  assert.deepEqual(getSafeSmtpErrorDetails({
    code: "EAUTH",
    command: "AUTH PLAIN",
    responseCode: 535,
    response: "502 rejected smtp-login test-smtp-key",
    message: "smtp key should not be logged",
  }, { SMTP_USER: "smtp-login", SMTP_PASS: "test-smtp-key" }), {
    code: "EAUTH",
    command: "AUTH PLAIN",
    responseCode: 535,
    response: "502 rejected [redacted] [redacted]",
  });
});