import puppeteer from "puppeteer";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { analyzeWebsite } from "../lib/analyze.mjs";
import { fileURLToPath } from "url";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Convert plain text → HTML
function textToHTML(text) {
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Convert bullet points
    if (/^-/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.replace(/^- /, "")}</li>`;
      continue;
    }

    // Paragraph
    if (inList) { html += "</ul>"; inList = false; }
    html += `<p>${line}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

// Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
  next();
});

// -------------------- ROUTE 1: ANALYZE WEBSITE --------------------
app.post("/analyze", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const result = await analyzeWebsite(url, puppeteer);
    res.json(result);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// -------------------- ROUTE 2: GENERATE PDF --------------------
app.post("/report-pdf", async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "Missing analysis JSON" });

    const prompt = `
You are a professional website auditor.
Write a detailed audit report based on this JSON:

${JSON.stringify(data, null, 2)}

Include sections:
Executive Summary
SEO Findings
Accessibility Review
Performance Review
Critical Issues
Actionable Recommendations

Write in professional tone, plain text, no markdown.
`;

    // ✅ USE HUGGINGFACE, NOT OPENAI
    const client = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: process.env.HUGGINGFACE_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: "meta-llama/Llama-3.1-8B-Instruct:novita",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1800,
    });

    const reportText = response.choices?.[0]?.message?.content?.trim() || "No content generated.";
    const formattedHTML = textToHTML(reportText);

    const templatePath = path.join(__dirname, "templates/report.html");
    let html = fs.readFileSync(templatePath, "utf8");

    html = html
      .replace("{{url}}", data.url)
      .replace("{{date}}", new Date().toLocaleDateString())
      .replace("{{{reportText}}}", formattedHTML);

    // ✅ Puppeteer PDF generation
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Website_Audit.pdf`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error("PDF Generation Error:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// -------------------- START SERVER --------------------
app.listen(process.env.PORT || 4000, () =>
  console.log("✅ Analyzer backend running")
);
