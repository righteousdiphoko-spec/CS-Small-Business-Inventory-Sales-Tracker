const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { createEmailService, getSafeSmtpErrorDetails, getSmtpConfigDiagnostics } = require("./email-service");
const emailService = createEmailService();

async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  const to = String(process.env.TEST_EMAIL_TO || "").trim();

  if (!emailService.isConfigured()) {
    console.error("SMTP configuration diagnostics:", getSmtpConfigDiagnostics());
    console.error("Set valid SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and EMAIL_FROM values first.");
    process.exitCode = 1;
    return;
  }
  if (!verifyOnly && !to) {
    console.error("Set TEST_EMAIL_TO to an inbox you control, or use --verify-only to check SMTP without sending email.");
    process.exitCode = 1;
    return;
  }

  console.info("SMTP test message diagnostics:", emailService.getTestEmailDiagnostics(to));
  try {
    await emailService.verifyConnection();
    console.info("SMTP connection status: verified.");
    console.info("SMTP test message diagnostics:", emailService.getTestEmailDiagnostics(to));
    if (!verifyOnly) {
      await emailService.sendTestEmail(to);
      console.info("Test email accepted by the mail server.");
    }
  } catch (error) {
    console.error("SMTP check failed.", {
      ...getSafeSmtpErrorDetails(error),
      ...emailService.getTestEmailDiagnostics(to),
    });
    process.exitCode = 1;
  } finally {
    emailService.close();
  }
}

main();
