// lib/analyze.mjs
import fs from "fs";
import * as cheerio from "cheerio";
import AxeBuilder from "@axe-core/puppeteer";
import lighthouse from "lighthouse";
import { launch as chromeLaunch } from "chrome-launcher";
import puppeteer from "puppeteer";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperAuthor from "metascraper-author";
import metascraperImage from "metascraper-image";
import metascraperPublisher from "metascraper-publisher";
import metascraperLang from "metascraper-lang";
import nlp from "compromise";
import ColorContrastChecker from "color-contrast-checker";

const scraper = metascraper([
  metascraperTitle(),
  metascraperDescription(),
  metascraperAuthor(),
  metascraperImage(),
  metascraperPublisher(),
  metascraperLang(),
]);

async function safeFetch(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch {
    return null;
  }
}

export async function analyzeWebsite(url) {
  const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
  console.log(`🔹 Starting analysis for: ${normalizedUrl}`);

  const html = await safeFetch(normalizedUrl);
  if (!html) return { error: "Page could not be fetched" };

  const $ = cheerio.load(html);
  const htmlMetrics = {
    title: $("title").text() || "No title",
    description: $('meta[name="description"]').attr("content") || null,
    h1: $("h1").first().text() || null,
    h2Count: $("h2").length,
    wordCount: $("body").text().split(/\s+/).filter(Boolean).length,
    links: $("a").length,
    images: $("img").length,
    missingAlt: $("img:not([alt])").length,
  };

  let metadata = {};
  try { metadata = await scraper({ html, url: normalizedUrl }); } catch (e) { /* ignore */ }

  const base = new URL(normalizedUrl).origin;
  const robotsTxt = await safeFetch(`${base}/robots.txt`);
  const sitemap = robotsTxt?.match(/sitemap:\s*(.*)/i)?.[1] || (await safeFetch(`${base}/sitemap.xml`)) || null;

  let accessibility = { violations: 0, details: [] };
  let colors = [];

  // Puppeteer + Axe - fully guarded
  try {
    // prefer environment CHROME_PATH or Puppeteer's bundled binary if installed
    const envPath = process.env.CHROME_PATH;
    const puppetPath = puppeteer.executablePath ? puppeteer.executablePath() : null;
    const execPath = envPath && fs.existsSync(envPath) ? envPath : (puppetPath && fs.existsSync(puppetPath) ? puppetPath : undefined);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      ...(execPath ? { executablePath: execPath } : {}),
    });

    const page = await browser.newPage();
    await page.goto(normalizedUrl, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => { /* ignore navigation timeout */ });

    // small delay to let dynamic frames load
    await page.waitForTimeout(1000);

    try {
      const axeBuilder = new AxeBuilder({ page });
      const results = await axeBuilder.analyze();
      accessibility = { violations: results.violations.length, details: results.violations };
    } catch (axeErr) {
      console.warn("⚠️ Axe scan failed:", axeErr?.message || axeErr);
      accessibility = { violations: 0, details: [] };
    }

    try {
      colors = await page.evaluate(() => {
        const set = new Set();
        document.querySelectorAll("*").forEach((el) => {
          const c = window.getComputedStyle(el).color;
          if (c) set.add(c);
        });
        return [...set].slice(0, 10);
      });
    } catch (e) {
      colors = [];
    }

    await browser.close();
  } catch (e) {
    console.warn("⚠️ Puppeteer failed:", e?.message || e);
    accessibility = { violations: 0, details: [] };
    colors = [];
  }

  // Lighthouse (only if a chrome binary is present and reachable)
  let performance = { performanceScore: 0, lcp: 0, cls: 0, tbt: 0 };
  try {
    const puppetPath = puppeteer.executablePath ? puppeteer.executablePath() : null;
    const chromePath = (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) ? process.env.CHROME_PATH :
                       (puppetPath && fs.existsSync(puppetPath) ? puppetPath : null);

    if (!chromePath) {
      console.log("⚠️ Lighthouse skipped — no chrome executable found for chrome-launcher.");
    } else {
      const chrome = await chromeLaunch({ chromePath, chromeFlags: ["--headless", "--no-sandbox", "--disable-setuid-sandbox"] });
      const result = await lighthouse(normalizedUrl, {
        logLevel: "error",
        output: "json",
        onlyCategories: ["performance"],
        port: chrome.port,
      });
      const lhr = result.lhr;
      performance = {
        performanceScore: (lhr?.categories?.performance?.score ?? 0) * 100,
        lcp: lhr?.audits?.["largest-contentful-paint"]?.numericValue ?? 0,
        cls: lhr?.audits?.["cumulative-layout-shift"]?.numericValue ?? 0,
        tbt: lhr?.audits?.["total-blocking-time"]?.numericValue ?? 0,
      };
      await chrome.kill();
    }
  } catch (e) {
    console.warn("⚠️ Lighthouse failed:", e?.message || e);
  }

  const doc = nlp($("body").text());
  const keywords = doc.nouns().out("array").slice(0, 15);

  const ccc = new ColorContrastChecker();
  const primaryContrast = colors.length >= 2 ? ccc.getContrastRatio(colors[0], colors[1]) : 0;

  return {
    url: normalizedUrl,
    htmlMetrics,
    metadata,
    robotsTxtFound: Boolean(robotsTxt),
    sitemap,
    accessibility,
    performance,
    keywords,
    colors: { palette: colors, primaryContrast },
    analyzedAt: new Date().toISOString(),
  };
}
