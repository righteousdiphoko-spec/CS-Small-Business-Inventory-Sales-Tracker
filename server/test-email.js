require("dotenv").config();

const nodemailer = require("nodemailer");

async function main() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT);
  const user = String(process.env.SMTP_USER || "");
  const password = String(process.env.SMTP_PASS || "");
  const from = String(process.env.EMAIL_FROM || "").trim();
  const to = String(process.env.TEST_EMAIL_TO || "").trim();
  const secureValue = String(process.env.SMTP_SECURE || "").toLowerCase();

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from || !to || !["true", "false"].includes(secureValue)) {
    console.error("Set valid SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM, and TEST_EMAIL_TO values first.");
    process.exitCode = 1;
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: secureValue === "true",
    auth: { user, pass: password },
  });

  try {
    await transport.verify();
    await transport.sendMail({
      from,
      to,
      subject: "SpazaKeep SMTP delivery test",
      text: "This is a test email confirming the configured SMTP transport can deliver mail.",
    });
    console.info("SMTP transport verified and test email accepted by the mail server.");
  } catch (error) {
    const code = /^[A-Z0-9_-]{1,32}$/.test(String(error.code || "")) ? error.code : "delivery-error";
    console.error(`SMTP test failed (${code}). Check the mail provider settings and logs.`);
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}

main();
