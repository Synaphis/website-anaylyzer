// === File: server/routes/reportRoutes.js ===
import express from 'express';
import path from 'path';
import fs from 'fs';


import { requestLimiter } from '../middleware/rateLimiter.js';
import { processReportAndEmail } from '../email/processReportAndEmail.js';
import { safeAnalyzeWebsite } from '../analysis/safeAnalyze.js';
import { generateReportWithData } from '../analysis/llmReport.js';
import { generatePdfFromHtml } from '../pdf/generatePdf.js';
import { textToHTML } from '../utils/textToHTML.js';


import { isForbiddenEmailLocalPart, isFreeEmailDomain, emailRegex } from '../validators/email.js';


const router = express.Router();


router.post('/report-request', requestLimiter, (req, res) => {
try {
const { url, firstName, lastName, email, company, jobTitle, phone } = req.body || {};
if (!url) return res.status(400).json({ error: 'Missing URL' });
if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email' });
if (isForbiddenEmailLocalPart(email)) return res.status(400).json({ error: 'Role-based emails not allowed' });
if (isFreeEmailDomain(email)) return res.status(400).json({ error: 'Use a company email' });
const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
try { new URL(normalizedUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
res.status(202).json({ status: 'accepted' });
processReportAndEmail({ url: normalizedUrl, firstName, lastName, email, company, jobTitle, phone });
} catch (err) {
console.error('/report-request error:', err?.stack || err);
return res.status(500).json({ error: 'Server error' });
}
});


router.post('/report-pdf', async (req, res) => {
try {
const { url } = req.body;
if (!url) return res.status(400).json({ error: 'URL is required' });
const analysis = await safeAnalyzeWebsite(url);
const reportText = await generateReportWithData(analysis);
let htmlContent = textToHTML(reportText);
htmlContent += `<div class="section"><h2>Disclaimer</h2><p>...</p></div>`;
const templatesDir = path.join(process.cwd(), 'server', 'templates');
const templatePath = path.join(templatesDir, 'report.html');
if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
if (!fs.existsSync(templatePath))
fs.writeFileSync(
templatePath,
`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial;margin:40px;}h2{margin-top:25px;border-left:4px solid #007acc;padding-left:10px;}</style></head><body><h1>Online Audit</h1><p><strong>URL:</strong>{{url}}</p><p><strong>Date:</strong>{{date}}</p><hr>{{{reportText}}}</body></html>`
);
const finalHtml = fs.readFileSync(templatePath, 'utf8').replace('{{url}}', analysis.url).replace('{{date}}', new Date().toLocaleDateString()).replace('{{{reportText}}}', htmlContent);
const pdfBuffer = await generatePdfFromHtml(finalHtml);
if (!pdfBuffer || pdfBuffer.length < 200) throw new Error('Generated PDF is corrupted');
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', `attachment; filename=Website_Audit.pdf`);
res.send(pdfBuffer);
} catch (err) {
console.error('/report-pdf error:', err?.stack || err);
res.status(500).json({ error: 'Failed PDF generation', details: err?.message || String(err) });
}
});


export default router;