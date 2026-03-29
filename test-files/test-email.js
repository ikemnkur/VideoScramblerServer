const nodemailer = require("nodemailer");
require("dotenv").config();

// Load SMTP configuration from environment variables
const SMTP_HOST = process.env.SES_SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SES_SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SES_SMTP_USER;
const SMTP_PASSWORD = process.env.SES_SMTP_PASSWORD;
const FROM_EMAIL = process.env.EMAIL_FROM || "no-reply@scramblurr.com";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Scramblurr";

// You can change this to your test recipient email
const TEST_RECIPIENT = "ikemuru@gmail.com"; // <-- CHANGE THIS TO YOUR EMAIL

async function testEmail() {
  console.log("🔧 SMTP Configuration:");
  console.log("  Host:", SMTP_HOST);
  console.log("  Port:", SMTP_PORT);
  console.log("  User:", SMTP_USER);
  console.log("  Password:", SMTP_PASSWORD ? "***" + SMTP_PASSWORD.slice(-4) : "NOT SET");
  console.log("  From:", `${FROM_NAME} <${FROM_EMAIL}>`);
  console.log("");

  // Validate configuration
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.error("❌ Error: Missing SMTP configuration in .env file");
    console.error("   Please ensure SES_SMTP_HOST, SES_SMTP_USER, and SES_SMTP_PASSWORD are set");
    process.exit(1);
  }

  console.log("📧 Creating transporter...");

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 20000,
    debug: true, // Enable debug output
    logger: true  // Log information to console
  });

  try {
    console.log("🔌 Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!");
    console.log("");

    console.log("📤 Sending test email...");
    const info = await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: TEST_RECIPIENT,
      subject: "Test Email - SMTP Configuration Check",
      text: "This is a test email to verify your SMTP configuration is working correctly.",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #4CAF50;">✅ SMTP Test Successful!</h2>
          <p>This is a test email to verify your SMTP configuration is working correctly.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 14px;">
            <strong>Configuration Details:</strong><br/>
            SMTP Host: ${SMTP_HOST}<br/>
            SMTP Port: ${SMTP_PORT}<br/>
            SMTP User: ${SMTP_USER}<br/>
            Sent: ${new Date().toLocaleString()}
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This is an automated test email from Scramblurr.
          </p>
        </div>
      `
    });

    console.log("✅ Email sent successfully!");
    console.log("📬 Message ID:", info.messageId);
    console.log("📨 Response:", info.response);
    console.log("");
    console.log("🎉 Your SMTP configuration is working correctly!");
    console.log(`   Check your inbox at: ${TEST_RECIPIENT}`);

  } catch (error) {
    console.error("❌ Error sending email:");
    console.error("   Message:", error.message);
    if (error.code) {
      console.error("   Code:", error.code);
    }
    if (error.response) {
      console.error("   Response:", error.response);
    }
    console.error("");
    console.error("🔍 Common issues:");
    console.error("   - Invalid SMTP credentials");
    console.error("   - Firewall blocking SMTP ports");
    console.error("   - SMTP service not active");
    console.error("   - Incorrect host or port");
    process.exit(1);
  }
}

// Run the test
console.log("🚀 Starting SMTP email test...");
console.log("");
testEmail();
