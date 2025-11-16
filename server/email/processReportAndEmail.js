// === File: server/email/processReportAndEmail.js ===
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Resend } from "resend";

import { safeAnalyzeWebsite } from "../analysis/safeAnalyze.js";
import { generateReportWithData } from "../analysis/llmReport.js";
import { textToHTML } from '../utils/TextToHtml.js';


import { generatePdfFromHtml } from "../pdf/generatePdf.js";
import { createZipBuffer } from "../utils/zip.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function processReportAndEmail({ url, firstName, lastName, email }) {
  try {
    // ---------------- Fetch Analysis ----------------
    const analysis = await safeAnalyzeWebsite(url);

    // ---------------- Generate Report ----------------
    const reportText = await generateReportWithData(analysis);
    let htmlContent = textToHTML(reportText);
    htmlContent += `
      <div class="section">
        <h2>Disclaimer</h2>
        <p>This automated audit provides a quick snapshot based on limited metrics 
        and may not capture every optimization opportunity. For a more comprehensive, 
        tailored and hands-on support, Synaphis offers expert consultancy and SaaS tools. 
        To explore deeper improvements in SEO, performance, accessibility, design, or overall digital strategy,
        please contact us at sales@synaphis.com.</p>
      </div>
    `;

    // ---------------- Template ----------------
    const templatesDir = path.join(process.cwd(), "server", "templates");
    const templatePath = path.join(templatesDir, "report.html");

    if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

    if (!fs.existsSync(templatePath)) {
      fs.writeFileSync(
        templatePath,
        `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>
          body{font-family:Arial;margin:40px;}
          h2{margin-top:25px;border-left:4px solid #007acc;padding-left:10px;}
        </style></head>
        <body>
          <h1>Online Presence & Performance Audit</h1>
          <p><strong>URL:</strong>{{url}}</p>
          <p><strong>Date:</strong>{{date}}</p>
          <hr>{{{reportText}}}
        </body></html>`
      );
    }

    const finalHtml = fs
      .readFileSync(templatePath, "utf8")
      .replace("{{url}}", analysis.url)
      .replace("{{date}}", new Date().toLocaleDateString())
      .replace("{{{reportText}}}", htmlContent);

    // ---------------- PDF Generation ----------------
    const pdfBuffer = await generatePdfFromHtml(finalHtml);
    if (!pdfBuffer || pdfBuffer.length < 200) throw new Error("Generated PDF is empty/corrupted");
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

    // ---------------- Debug PDF Copy ----------------
    try {
      const domain = analysis.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const debugFilename = `resend-sent-${Date.now()}-${domain}.pdf`;
      const debugPath = path.join(os.tmpdir(), debugFilename);
      fs.writeFileSync(debugPath, buf);
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      console.log(`Wrote local PDF copy: ${debugPath} (bytes: ${buf.length}, sha256: ${sha256})`);
    } catch (writeErr) {
      console.warn("Failed to write local debug PDF:", writeErr);
    }

    // ---------------- Create ZIP ----------------
    let zipBuffer = null;
    try {
      zipBuffer = await createZipBuffer("audit-report.pdf", buf);
      console.log(`Created in-memory ZIP (bytes: ${zipBuffer.length})`);
    } catch (zipErr) {
      console.error("Failed creating ZIP in memory:", zipErr);
      zipBuffer = null;
    }

    // ---------------- Attachment ----------------
    const domainClean = analysis.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const attachment = zipBuffer
      ? { filename: `audit-report-${domainClean}.zip`, content: zipBuffer.toString("base64"), type: "application/zip" }
      : { filename: `audit-report-${domainClean}.pdf`, content: buf.toString("base64"), type: "application/pdf" };

    // ---------------- Send Email ----------------
    try {
      await resend.emails.send({
        from: "sales@synaphis.com",
        to: email,
        subject: `Your Website Audit for ${analysis.url}`,
        text: `Hi ${firstName || ""} ${lastName || ""},\n\nPlease find attached your website audit report for ${analysis.url} that you requested.\n\nIf you have any questions or would like a deeper review, reply to this email.\n\nBest,\nThe Synaphis Team\n`,
        attachments: [attachment],
      });

      console.log(`✅ Report emailed to ${email} for URL ${analysis.url} via Resend (sent ${attachment.filename})`);
    } catch (sendErr) {
      console.error("Resend email send failed:", sendErr);

      // Save failed email copy
      try {
        if (zipBuffer) {
          const failPath = path.join(os.tmpdir(), `resend-failed-${Date.now()}-${domainClean}.zip`);
          fs.writeFileSync(failPath, zipBuffer);
          console.log("Wrote failed-send ZIP to:", failPath);
        } else {
          const failPdfPath = path.join(os.tmpdir(), `resend-failed-${Date.now()}-${domainClean}.pdf`);
          fs.writeFileSync(failPdfPath, buf);
          console.log("Wrote failed-send PDF to:", failPdfPath);
        }
      } catch (dbgErr) {
        console.warn("Failed writing debug file after send error:", dbgErr);
      }

      throw sendErr;
    }
  } catch (err) {
    console.error("processReportAndEmail error:", err?.stack || err);
  }
}
