// analyze-llm-ready.mjs
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import lighthouse from 'lighthouse';
import { launch as chromeLaunch } from 'chrome-launcher';
import metascraper from 'metascraper';
import metascraperTitle from 'metascraper-title';
import metascraperDescription from 'metascraper-description';
import metascraperUrl from 'metascraper-url';
import metascraperImage from 'metascraper-image';
import metascraperLogo from 'metascraper-logo';

// ---------------------- METASCRAPER ----------------------
const scraper = metascraper([
  metascraperTitle(),
  metascraperDescription(),
  metascraperUrl(),
  metascraperImage(),
  metascraperLogo(),
]);

// ---------------------- UTILITIES ----------------------
async function safeFetch(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

function extractKeywordsFromHtml(html, limit = 20) {
  const text = cheerio.load(html)('body').text().replace(/\s+/g, ' ');
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const freq = {};
  const stopwords = new Set(['this','that','with','from','your','have','will','here','true','null','https','http']);
  for (const w of words) if (!stopwords.has(w)) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

// ---------------------- JSON-LD ----------------------
function extractJsonLd($) {
  const out = [];
  $('script[type="application/ld+json"]').each((i, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);
      Array.isArray(parsed) ? out.push(...parsed) : out.push(parsed);
    } catch {}
  });
  return out;
}

// ---------------------- SITEMAP / ROBOTS ----------------------
async function fetchSitemapInfo(url) {
  try {
    const base = new URL(url).origin;
    const candidates = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];
    for (const sUrl of candidates) {
      const xml = await safeFetch(sUrl, 8000);
      if (!xml) continue;
      const $ = cheerio.load(xml, { xmlMode: true });
      const urls = $('url').toArray();
      const lastmods = $('lastmod').map((i, el) => $(el).text()).get();
      const latest = lastmods.length
        ? new Date(Math.max(...lastmods.map((d) => new Date(d).getTime()))).toISOString()
        : null;
      return { sitemapUrl: sUrl, pages: urls.length || null, latestSitemapDate: latest };
    }
  } catch {}
  return { sitemapUrl: null, pages: null, latestSitemapDate: null };
}

async function fetchRobotsInfo(url) {
  try {
    const base = new URL(url).origin;
    const txt = await safeFetch(`${base}/robots.txt`, 4000);
    if (!txt) return { robots: null, crawlAllowed: true };
    const disallows = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).filter(l => /^disallow:/i.test(l));
    return { robots: txt, crawlAllowed: !disallows.some(d => d.match(/:\s*\/\s*$/i)) };
  } catch {
    return { robots: null, crawlAllowed: true };
  }
}

// ---------------------- TECH DETECTION ----------------------
function detectTech(html, $) {
  const s = String(html).toLowerCase();
  return {
    analytics: [
      ...( /gtag\(|google-analytics|analytics\.js|measurementid=G-/i.test(s) ? ['GA'] : [] ),
      ...( /googletagmanager\.com\/gtm\.js/i.test(s) ? ['GTM'] : [] ),
      ...( /fbq\(|facebook\.net\/tr\.js/i.test(s) ? ['Facebook Pixel'] : [] ),
    ],
    canonical: $('link[rel="canonical"]').attr('href') || null
  };
}

// ---------------------- CONVERSION ----------------------
function detectConversion($, jsonLdBlocks, url) {
  const ctaCount = $('a,button,input[type=submit]').filter((i, el) => {
    const txt = ($(el).text() || $(el).attr('aria-label') || '').toLowerCase();
    return txt.match(/buy|order|add to cart|subscribe|get started|checkout/i);
  }).length;
  const forms = $('form').length;
  const hasProductLd = jsonLdBlocks.some(b => JSON.stringify(b).toLowerCase().includes('product'));
  const urlPath = new URL(url).pathname.toLowerCase();
  const pageType = hasProductLd || /\/product|\/item\//i.test(urlPath)
    ? 'product'
    : /\/blog|\/article|\/post/.test(urlPath)
    ? 'article'
    : urlPath === '/' ? 'homepage' : 'landing';
  const hasCart = $('a[href*="cart"], a[href*="checkout"], [class*="cart"]').length > 0;
  return { ctaCount, forms, hasProductLd, pageType, hasCart, isEcommerce: hasProductLd || hasCart };
}

// ---------------------- LIGHTHOUSE ----------------------
async function runLighthouse(url) {
  try {
    const chrome = await chromeLaunch({ chromeFlags: ['--headless', '--no-sandbox'] });
    const { lhr } = await lighthouse(url, { port: chrome.port, output: 'json', onlyCategories: ['performance','accessibility','seo'] });
    await chrome.kill();
    const audits = lhr.audits || {};
    return {
      performanceScore: Math.round(lhr.categories.performance.score*100),
      accessibilityScore: Math.round(lhr.categories.accessibility.score*100),
      seoScore: Math.round(lhr.categories.seo.score*100),
      lcp: audits['largest-contentful-paint']?.numericValue || null,
      cls: audits['cumulative-layout-shift']?.numericValue || null,
      tbt: audits['total-blocking-time']?.numericValue || null,
      keyAudits: {
        renderBlocking: audits['render-blocking-resources']?.displayValue || null,
        unusedJS: audits['unused-javascript']?.displayValue || null,
        imageOptimization: audits['uses-optimized-images']?.displayValue || null,
        thirdPartyRequests: audits['third-party-summary']?.displayValue || null
      }
    };
  } catch {
    return null;
  }
}

// ---------------------- SOCIAL ----------------------
function extractSocialLinks($) {
  const platforms = ['facebook','twitter','instagram','linkedin','youtube','tiktok'];
  const profiles = {};
  platforms.forEach(p => {
    const a = $(`a[href*="${p}.com"]`).attr('href');
    if(a) profiles[p] = a;
  });
  return profiles;
}
function computeSocialScore(profiles) {
  return Math.min(100, Object.keys(profiles).length * 20);
}

// ---------------------- MAIN ----------------------
export async function analyzeWebsite(url, options = { runLighthouse:true }) {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
  let html = await safeFetch(normalizedUrl, 15000);

  if(!html || html.length<1000) {
    const browser = await puppeteer.launch({ headless:true, args:['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(normalizedUrl, { waitUntil:'networkidle2', timeout:30000 });
    html = await page.content();
    await browser.close();
  }

  const $ = cheerio.load(html);
  const jsonLdBlocks = extractJsonLd($);
  const metadata = await scraper({ html, url: normalizedUrl });
  const keywords = extractKeywordsFromHtml(html, 20);
  const sitemapInfo = await fetchSitemapInfo(normalizedUrl);
  const robotsInfo = await fetchRobotsInfo(normalizedUrl);
  const tech = detectTech(html, $);
  const conversion = detectConversion($, jsonLdBlocks, normalizedUrl);
  const lighthouseResult = options.runLighthouse ? await runLighthouse(normalizedUrl) : null;
  const socialProfiles = extractSocialLinks($);

  return {
    url: normalizedUrl,
    domain: new URL(normalizedUrl).hostname,
    canonical: tech.canonical,
    pageType: conversion.pageType,
    siteSignals: {
      hasSitemap: Boolean(sitemapInfo.sitemapUrl),
      sitemapUrl: sitemapInfo.sitemapUrl,
      pagesIndexedEstimate: sitemapInfo.pages,
      sitemapLatestDate: sitemapInfo.latestSitemapDate,
      robots: Boolean(robotsInfo.robots),
      crawlAllowed: robotsInfo.crawlAllowed,
      analytics: tech.analytics,
      ssl_valid: normalizedUrl.startsWith('https://')
    },
    htmlMetrics: {
      title: $('title').text().trim() || null,
      description: $('meta[name="description"]').attr('content') || null,
      h1_text: $('h1').first().text().trim() || null,
      h1_present: Boolean($('h1').length && $('h1').text().trim()),
      wordCount: $('body').text().split(/\s+/).filter(Boolean).length,
      links: $('a').length,
      images: $('img').length,
      missingAlt: $('img:not([alt])').length
    },
    metadata,
    seo: {
      titleLength: ($('title').text()||'').length,
      metaDescLength: ($('meta[name="description"]').attr('content')||'').length,
      h1_present: Boolean($('h1').text().trim()),
      structuredDataTypes: Array.from(new Set(jsonLdBlocks.flatMap(b => {
        if(b['@type']) return Array.isArray(b['@type']) ? b['@type'] : [b['@type']];
        if(b['@graph']) return b['@graph'].map(g => g['@type']);
        return [];
      }))).map(s => String(s).toLowerCase())
    },
    content: {
      keywords,
      contentFreshness: { latest: sitemapInfo.latestSitemapDate || null },
      ctaCount: conversion.ctaCount,
      wordCount: $('body').text().split(/\s+/).filter(Boolean).length,
      images: $('img').length,
      missingAlt: $('img:not([alt])').length
    },
    performance: lighthouseResult,
    social: {
      profiles: socialProfiles,
      presenceScore: computeSocialScore(socialProfiles)
    },
    conversionSignals: {
      hasCheckout: conversion.hasCart,
      hasNewsletter: Boolean($('input[type="email"]').length),
      ctaCount: conversion.ctaCount,
      forms: conversion.forms
    },
    analyzedAt: new Date().toISOString()
  };
}
