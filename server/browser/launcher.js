// === File: server/browser/launcher.js ===
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';


function findLocalChrome() {
try {
const chromeRoot = path.resolve(process.cwd(), 'chrome');
if (!fs.existsSync(chromeRoot)) return null;
const entries = fs.readdirSync(chromeRoot, { withFileTypes: true });
const chromeDir = entries.find((e) => e.isDirectory() && e.name === 'chrome') || entries.find((e) => e.isDirectory());
if (!chromeDir) return null;
const chromeDirPath = path.join(chromeRoot, chromeDir.name);
const versions = fs.readdirSync(chromeDirPath, { withFileTypes: true }).filter((d) => d.isDirectory());
for (const v of versions) {
const candidate = path.join(chromeDirPath, v.name, 'chrome-linux64', 'chrome');
if (fs.existsSync(candidate)) return candidate;
}
return null;
} catch (err) {
console.warn('findLocalChrome error:', err?.message || err);
return null;
}
}


export async function launchBrowser() {
if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
console.log('Using CHROME_PATH:', process.env.CHROME_PATH);
return puppeteer.launch({
executablePath: process.env.CHROME_PATH,
headless: true,
args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
}
const localChrome = findLocalChrome();
if (localChrome) {
console.log('Using local chrome at:', localChrome);
return puppeteer.launch({ executablePath: localChrome, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
}
try {
const exe = typeof puppeteer.executablePath === 'function' ? puppeteer.executablePath() : puppeteer.executablePath;
if (exe && fs.existsSync(exe)) {
console.log('Using puppeteer.executablePath():', exe);
return puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
}
} catch (err) {
console.warn('puppeteer.executablePath() failed:', err?.message || err);
}
console.log('Fallback: launching puppeteer without executablePath');
return puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
}