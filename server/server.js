import puppeteer, { executablePath } from "puppeteer";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai"; // client wrapper for Hugging Face router
import { analyzeWebsite } from "../lib/analyze.mjs";
import { fileURLToPath } from "url";
import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// --- ES module dirname fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Helper: Convert plain text to simple HTML ---
function textToHTML(text) {
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (/^-/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${line.replace(/^- /, "")}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    html += `<p>${line}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

// ---------------- ROUTES ----------------
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin}`
  );
  next();
});

// --- Analyze website ---
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

// --- Generate PDF ---
app.post("/report-pdf", async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "Missing analysis JSON" });

    // --- LLM Prompt ---
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

    // --- Hugging Face LLM client ---
    const client = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: process.env.HUGGINGFACE_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: "meta-llama/Llama-3.1-8B-Instruct:novita",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1800,
    });

    const reportText =
      response.choices?.[0]?.message?.content?.trim() ||
      "No content generated.";
    const formattedHTML = textToHTML(reportText);

    // --- Load HTML template ---
    const templatePath = path.join(__dirname, "templates/report.html");
    let html = fs.readFileSync(templatePath, "utf8");
    html = html
      .replace("{{url}}", data.url)
      .replace("{{date}}", new Date().toLocaleDateString())
      .replace("{{{reportText}}}", formattedHTML);

    // --- Puppeteer launch for Render ---
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath(), // ensure Puppeteer uses bundled Chromium
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Website_Audit.pdf`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// --- Optional Lighthouse endpoint ---
app.post("/performance", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const chrome = await launchChrome({
      chromePath: executablePath(),
      chromeFlags: ["--headless", "--no-sandbox"],
    });

    const result = await lighthouse(url, {
      logLevel: "error",
      output: "json",
      onlyCategories: ["performance"],
      port: chrome.port,
    });

    await chrome.kill();

    res.json({ performance: result.lhr.categories.performance });
  } catch (error) {
    console.error("Lighthouse Error:", error);
    res.status(500).json({ error: "Failed to get performance metrics" });
  }
});

// --- Start server ---
app.listen(process.env.PORT || 4000, () =>
  console.log("✅ Analyzer backend running")
);
