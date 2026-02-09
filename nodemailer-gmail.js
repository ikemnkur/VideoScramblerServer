const nodemailer = require("nodemailer");
require("dotenv").config();
const { google } = require("googleapis");
// import { nodemailer } from "nodemailer";
// import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "xxx";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "xxx";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "https://developers.google.com/oauthplayground";
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || "xxx";

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function sendMail() {
  const accessToken = await oAuth2Client.getAccessToken();
  const tokenValue = accessToken && accessToken.token ? accessToken.token : accessToken;

  console.log("GMAIL_USER env:", process.env.GMAIL_USER || "yourmail@gmail.com");

  if (!tokenValue) {
    throw new Error("Failed to get access token from refresh token");
  }

  try {
    oAuth2Client.setCredentials({ access_token: tokenValue });
    const oauth2 = google.oauth2({ auth: oAuth2Client, version: "v2" });
    const { data } = await oauth2.userinfo.get();
    console.log("OAuth token email:", data && data.email ? data.email : data);
  } catch (error) {
    console.error("Failed to fetch OAuth userinfo:", error && error.message ? error.message : error);
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    // auth: { ... },
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER || "yourmail@gmail.com",
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: tokenValue,
    },
  });

  const result = await transporter.sendMail({
    from: `Scramblurr App <${process.env.GMAIL_USER || "yourmail@gmail.com"}>`,
    to: "ikemuru@gmail.com",
    subject: "Hello from Scramblurr App",
    text: "New user registered on Scramblurr App!",
    html: "<b>This is a confirmation email. Welcome to Scramblurr App!</b>",
  });

  console.log("Email sent:", result.messageId);
}

sendMail();



// Email verification 
// email-service.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'mail.videoscrambler.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'emailuser@videoscrambler.com',
    pass: 'Password!*'
  }
});

async function sendPromoEmail(recipients) {
  const mailOptions = {
    from: '"Your Company" <noreply@yourdomain.com>',
    to: recipients.join(', '),
    subject: 'Monthly Promotion',
    html: '<h1>Special Offer This Month!</h1><p>Your promo content here...</p>'
  };

  await transporter.sendMail(mailOptions);
}


// // Schedule promotional email every 30 days (only runs after the first interval)
// const sendScheduledPromoEmail = () => {
//   const recipients = ['ikemuru@gmail.com', 'ikenuru@gmail.com'];
//   sendPromoEmail(recipients)
//     .then(() => console.log('Promotional email sent successfully'))
//     .catch(err => console.error('Error sending promotional email:', err));
//   console.log('Scheduled promotional email sent to:', recipients);
// };

// // Set up the interval to run every 30 days
// setInterval(sendScheduledPromoEmail, 30 * 24 * 60 * 60 * 1000);
// console.log('Promotional email scheduler initialized. First email will be sent in 30 days.');async function sendAccountVerificationEmail(newUser) {
// console.log('Promotional email scheduler initialized. First email will be sent in 30 days.');


async function sendAccountVerificationEmail(newUser) {
  const msg = {
    to: newUser.email,
    from: process.env.FROM_EMAIL,
    subject: 'Welcome to Scramblurr! 🎉',
    text: 'Please confirm your email to get started with using Scramblurr.',
    html: `Here is your confirmation email. Welcome aboard, ${newUser.firstName}!
    <br><br>
    We are thrilled to have you use the Scramblurr app. Your account has been successfully created with the username: <strong>${newUser.username}</strong>.
    <br><br>
    To get started, please verify your email address by clicking the link below:
    <br><br>
    <a href="https://Scramblurr.com/verify-email?email=${encodeURIComponent(newUser.email)}">Verify Email Address</a>
    <br><br>
    If you did not sign up for a Scramblurr account, please ignore this email.
    <br><br>
    Best regards,
    <br>
    The Scramblurr Team`
  };

  // Send email with error handling via SendGrid
  try {
    await sgMail.send(msg);
    console.log(`✅ Email sent to ${msg.to}`);
  } catch (emailError) {
    console.error('⚠️ Failed to send welcome email:', emailError.message);
    // Don't fail the registration if email fails
  }
}

// Send password reset email
async function sendPasswordResetEmail(email, username, newPassword) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Admin System" <admin@example.com>',
      to: email,
      subject: 'Your Password Has Been Reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333;">Password Reset</h2>
          <p>Hello ${username},</p>
          <p>Your password ha s been reset by an administrator.</p>
          <p>Your new password is: <strong>${newPassword}</strong></p>
          <p>Please login with this password and change it immediately for security reasons.</p>
          <p style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

module.exports = {
  sendPasswordResetEmail
};

