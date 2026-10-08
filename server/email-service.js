const nodemailer = require("nodemailer");

const APPLICATION_NAME = "Small Business Inventory & Sales Tracker";

function parseEmailAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return { name: "", address: "" };

  const bracketMatch = raw.match(/^(.+?)\s*<([^<>]+)>$/);
  if (bracketMatch) {
    return {
      name: bracketMatch[1].trim(),
      address: bracketMatch[2].trim(),
    };
  }

  return { name: "", address: raw };
}

function isValidEmailAddress(value) {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(String(value || "").trim());
}

function getSmtpOptions(env) {
  const host = String(env.SMTP_HOST || "").trim();
  const port = Number.parseInt(String(env.SMTP_PORT ?? "").trim(), 10);
  const secure = String(env.SMTP_SECURE || "").trim().toLowerCase();
  const user = String(env.SMTP_USER || "").trim();
  const password = String(env.SMTP_PASS || "");

  if (!host) throw new Error("SMTP_HOST must be configured.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }
  if (secure && !["true", "false", "1", "0", "yes", "no", "on", "off"].includes(secure)) {
    throw new Error("SMTP_SECURE must be true or false.");
  }
  if (!user || !password) throw new Error("SMTP_USER and SMTP_PASS must be configured.");

  return {
    host,
    port,
    secure: ["true", "1", "yes", "on"].includes(secure),
    auth: { user, pass: password },
  };
}

function getSmtpConfigDiagnostics(env = process.env) {
  const host = String(env.SMTP_HOST || "").trim();
  const port = String(env.SMTP_PORT ?? "").trim();
  const secure = String(env.SMTP_SECURE || "").trim();
  const user = String(env.SMTP_USER || "").trim();
  const password = String(env.SMTP_PASS || "");
  const sender = String(env.EMAIL_FROM || "").trim();

  const parsedPort = Number.parseInt(port, 10);
  const normalizedSecure = secure.toLowerCase();

  return {
    SMTP_HOST: host ? "present" : "invalid",
    SMTP_PORT: port && Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? "present" : "invalid",
    SMTP_SECURE: secure && ["true", "false", "1", "0", "yes", "no", "on", "off"].includes(normalizedSecure) ? "present" : "invalid",
    SMTP_USER: user ? "present" : "invalid",
    SMTP_PASS: password ? "present" : "invalid",
    EMAIL_FROM: isValidEmailAddress(parseEmailAddress(sender).address) ? "present" : "invalid",
  };
}

function getSender(env) {
  const rawFrom = String(env.EMAIL_FROM || "").trim();
  const parsed = parseEmailAddress(rawFrom);
  const explicitName = parsed.name || String(env.EMAIL_FROM_NAME || "").trim();
  const address = parsed.address;
  const name = explicitName || APPLICATION_NAME;

  if (!isValidEmailAddress(address)) {
    throw new Error("EMAIL_FROM must be a valid sender email address.");
  }

  return { name, address };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function getSafeSmtpErrorDetails(error, env = process.env) {
  const code = /^[A-Z0-9_-]{1,32}$/.test(String(error?.code || "")) ? error.code : "SMTP_ERROR";
  const command = /^[A-Z0-9_ -]{1,32}$/i.test(String(error?.command || "")) ? error.command : undefined;
  const responseCode = Number.isInteger(error?.responseCode) ? error.responseCode : undefined;
  let response = String(error?.response || "").replace(/[\r\n\t]+/g, " ").slice(0, 500);
  for (const secret of [env.SMTP_USER, env.SMTP_PASS].filter(Boolean)) {
    response = response.split(String(secret)).join("[redacted]");
  }
  response = response.replace(/((?:smtp[_ -]?(?:pass|key)|api[_ -]?key|password|token)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
  return {
    code,
    ...(command ? { command } : {}),
    ...(responseCode ? { responseCode } : {}),
    ...(response ? { response } : {}),
  };
}

function createEmailService({ env = process.env, transporterFactory = nodemailer.createTransport } = {}) {
  let transporter = null;
  let connectionStatus = "not checked";

  function getTransporter() {
    if (!transporter) transporter = transporterFactory(getSmtpOptions(env));
    return transporter;
  }

  function isConfigured() {
    try {
      getSmtpOptions(env);
      getSender(env);
      return true;
    } catch {
      return false;
    }
  }

  async function sendMail({ to, subject, text, html }) {
    await getTransporter().sendMail({ from: getSender(env), to, subject, text, html });
  }

  function getTestEmailMessage(to) {
    const appName = String(env.EMAIL_FROM_NAME || APPLICATION_NAME).trim() || APPLICATION_NAME;
    return {
      from: getSender(env),
      to,
      subject: `${appName} SMTP delivery test`,
      text: `This is a test email confirming the ${appName} SMTP transport can deliver mail.`,
    };
  }

  return {
    isConfigured,
    async verifyConnection() {
      connectionStatus = "checking";
      try {
        const result = await getTransporter().verify();
        connectionStatus = "verified";
        return result;
      } catch (error) {
        connectionStatus = "failed";
        throw error;
      }
    },
    async sendPasswordResetEmail(to, resetUrl) {
      const appName = String(env.EMAIL_FROM_NAME || APPLICATION_NAME).trim() || APPLICATION_NAME;
      const safeAppName = escapeHtml(appName);
      const safeResetUrl = escapeHtml(resetUrl);
      const subject = `Reset your password - ${appName}`;
      const text = `${appName}\n\nWe received a request to reset your password. Use this secure link within 30 minutes:\n\n${resetUrl}\n\nIf you did not request this reset, you can ignore this email.`;
      const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#202124"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#f4f5f7"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5e7eb;border-radius:8px"><tr><td style="padding:32px"><p style="margin:0 0 20px;color:#555;font-size:13px;font-weight:700">${safeAppName}</p><h1 style="margin:0 0 16px;font-size:23px;line-height:1.3">Reset your password</h1><p style="margin:0 0 24px;color:#4b5563;line-height:1.6">We received a request to reset the password for your account. Use the button below to choose a new password.</p><p style="margin:0 0 24px"><a href="${safeResetUrl}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#111827;color:#fff;text-decoration:none;font-weight:700">Reset password</a></p><p style="margin:0 0 12px;color:#4b5563;line-height:1.6">This secure link expires in 30 minutes and can only be used once.</p><p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6">If you did not request this reset, you can ignore this email. Your password will not change.</p></td></tr></table></td></tr></table></body></html>`;
      await sendMail({ to, subject, text, html });
    },
    async sendPasswordChangedEmail(to) {
      const appName = String(env.EMAIL_FROM_NAME || APPLICATION_NAME).trim() || APPLICATION_NAME;
      const safeAppName = escapeHtml(appName);
      const subject = "Your password has been changed";
      const text = `${appName}\n\nYour password was successfully changed. If you did not perform this action, contact your administrator or support immediately.`;
      const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#202124"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#f4f5f7"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5e7eb;border-radius:8px"><tr><td style="padding:32px"><p style="margin:0 0 20px;color:#555;font-size:13px;font-weight:700">${safeAppName}</p><h1 style="margin:0 0 16px;font-size:23px;line-height:1.3">Password changed</h1><p style="margin:0 0 16px;color:#4b5563;line-height:1.6">Your password was successfully changed.</p><p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6">If you did not perform this action, contact your administrator or support immediately.</p></td></tr></table></td></tr></table></body></html>`;
      await sendMail({ to, subject, text, html });
    },
    async sendTestEmail(to) {
      const message = getTestEmailMessage(to);
      await getTransporter().sendMail(message);
    },
    getTestEmailDiagnostics(to) {
      const options = getSmtpOptions(env);
      const message = getTestEmailMessage(to);
      return {
        senderEmail: message.from.address,
        senderName: message.from.name,
        recipientEmail: message.to || "(not set)",
        subject: message.subject,
        smtpHost: options.host,
        smtpPort: options.port,
        smtpConnectionStatus: connectionStatus,
        messageFormat: "text/plain",
        textLength: message.text.length,
        htmlIncluded: Boolean(message.html),
      };
    },
    setTransportForTests(value) {
      transporter = value;
    },
    close() {
      if (typeof transporter?.close === "function") transporter.close();
    },
  };
}

module.exports = { APPLICATION_NAME, createEmailService, getSafeSmtpErrorDetails, getSmtpConfigDiagnostics };