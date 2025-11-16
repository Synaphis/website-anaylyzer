// === File: server/pdf/generatePdf.js ===
import fs from 'fs';
import path from 'path';
import { launchBrowser } from '../browser/launcher.js';


export async function generatePdfFromHtml(finalHtml) {
let browser = null;
try {
browser = await launchBrowser();
const page = await browser.newPage();
await page.setContent(finalHtml, { waitUntil: 'load', timeout: 60000 });
await page.setViewport({ width: 1200, height: 800 });
const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
await browser.close();
return pdfBuffer;
} catch (err) {
console.error('generatePdfFromHtml failed:', err?.stack || err);
if (browser) try { await browser.close(); } catch {}
throw err;
}
}