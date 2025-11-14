import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";

async function sendTestEmail() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g., smtp.zoho.eu
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_PORT === "465", // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER, // your Zoho email
        pass: process.env.SMTP_PASS, // the application-specific password
      },
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.TEST_EMAIL_TO || process.env.SMTP_USER, // send to yourself for testing
      subject: "Zoho SMTP Test Email",
      text: "Hello! This is a test email from Nodemailer + Zoho.",
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", info.messageId);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
}

sendTestEmail();
