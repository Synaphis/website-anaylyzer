// server/server.js
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-core";
import OpenAI from "openai";
import { analyzeWebsite } from "../lib/analyze.mjs";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

// Allow from all origins while testing. Change to your frontend in production.
const FRONTEND = process.env.FRONTEND_URL || "*";
app.use(cors({ origin: FRONTEND }));

// ES module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global safety: don't let unhandled rejections crash the process
process.on("unhandledRejection", (reason) => {
  console.warn("⚠️ Unhandled promise rejection:", reason);
});

// simple converter for LLM text -> minimal HTML
function textToHTML(text = "") {
  const lines = text.split("\n");
  let html = "";
  let inList = false;

  // Define major section headings
  const headings = [
    "Executive Summary",
    "SEO Findings",
    "Accessibility Review",
    "Performance Review",
    "Critical Issues",
    "Actionable Recommendations"
  ];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Check if the line is a major section heading
    const isHeading = headings.find(h => line.toLowerCase().startsWith(h.toLowerCase()));
    if (isHeading) {
      if (inList) { html += "</ul>"; inList = false; }
      // Add a page break for all headings except the first one
      html += `<h2 class="page-break">${line}</h2>`;
      continue;
    }

    // Detect lists
    if (/^- /.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.replace(/^- /, "")}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }

    // Convert markdown bold/italic to HTML
    line = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    line = line.replace(/\*(.*?)\*/g, "<em>$1</em>");

    html += `<p>${line}</p>`;
  }

  if (inList) html += "</ul>";

  return html;
}


// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
  next();
});

// Utility: find chrome executable in ./chrome folder installed by render-build.sh
function findLocalChrome() {
  try {
    const chromeRoot = path.resolve(process.cwd(), "chrome");
    if (!fs.existsSync(chromeRoot)) return null;

    // chrome folder contains a subfolder named 'chrome' and then a version folder
    // pattern: chrome/chrome/<version>/chrome-linux64/chrome
    const entries = fs.readdirSync(chromeRoot, { withFileTypes: true });
    // look for 'chrome' directory (ppl using PUPPETEER_CACHE_DIR=./chrome produce chrome/chrome/...)
    const chromeDir = entries.find(e => e.isDirectory() && e.name === "chrome") || entries.find(e => e.isDirectory());
    if (!chromeDir) return null;

    const chromeDirPath = path.join(chromeRoot, chromeDir.name);
    // if this contains version directories, pick the first one
    const versions = fs.readdirSync(chromeDirPath, { withFileTypes: true }).filter(d => d.isDirectory());
    if (versions.length === 0) return null;
    // try each version until we find the executable
    for (const v of versions) {
      const candidate = path.join(chromeDirPath, v.name, "chrome-linux64", "chrome");
      if (fs.existsSync(candidate)) return candidate;
      // some puppeteer versions might put it under chrome-mac/chrome or different names; skip those here
    }
    return null;
  } catch (err) {
    console.warn("findLocalChrome error:", err?.message || err);
    return null;
  }
}

async function launchBrowser() {
  // 1) explicit env var override
  const envPath = process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) {
    console.log("Using CHROME_PATH from env:", envPath);
    return puppeteer.launch({
      executablePath: envPath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }

  // 2) local chrome installed during build into ./chrome
  const localChrome = findLocalChrome();
  if (localChrome) {
    console.log("Using local chrome at:", localChrome);
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }

  // 3) fall back to puppeteer.executablePath() if available (rare with puppeteer-core)
  try {
    const exe = puppeteer.executablePath && typeof puppeteer.executablePath === "function" ? puppeteer.executablePath() : null;
    if (exe && fs.existsSync(exe)) {
      console.log("Using puppeteer.executablePath():", exe);
      return puppeteer.launch({
        executablePath: exe,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
    }
  } catch (e) {
    // ignore
  }

  throw new Error("Could not locate Chrome executable. Set CHROME_PATH, or ensure the build step installed Chrome into ./chrome.");
}

// ----------------- /analyze -----------------
app.post("/analyze", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // analyzeWebsite will attempt to use Puppeteer (bundled Chromium) internally
    const result = await analyzeWebsite(url);
    res.json(result);
  } catch (err) {
    console.error("Analysis Error:", err);
    res.status(500).json({ error: err?.message || "Analysis failed" });
  }
});

// ----------------- /report-pdf -----------------
app.post("/report-pdf", async (req, res) => {
  let browser;
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

    // Use OpenAI client but point to Hugging Face router via baseURL and HF key (you already used this)
    const client = new OpenAI({
      baseURL: process.env.HF_ROUTER_BASEURL || "https://router.huggingface.co/v1",
      apiKey: process.env.HUGGINGFACE_API_KEY,
    });

    const model = process.env.HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct:novita";

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1800,
    });

    const reportText = response.choices?.[0]?.message?.content?.trim() || "No content generated by LLM.";
    const formattedHTML = textToHTML(reportText);

    // load template and inject
    const templatePath = path.join(__dirname, "../server/templates/report.html");
    let html = fs.readFileSync(templatePath, "utf8");
    html = html.replace("{{url}}", data.url || "")
               .replace("{{date}}", new Date().toLocaleDateString())
               .replace("{{{reportText}}}", formattedHTML);

    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    await browser.close();
    browser = null;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Website_Audit.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
    res.status(500).json({
      error: "Failed to generate PDF",
      details: error?.message || String(error),
    });
  }
});

// small health endpoint so root returns JSON
app.get("/", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Analyzer backend running on port ${PORT}`));
