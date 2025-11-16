// === File: server/validators/email.js ===
const forbiddenLocalParts = new Set([
'support', 'careers', 'career', 'info', 'admin', 'contact', 'webmaster', 'sales', 'hello', 'noreply', 'no-reply', 'jobs', 'hr', 'team', 'press', 'marketing', 'office', 'service', 'services',
]);
export function isForbiddenEmailLocalPart(email = '') {
try { return forbiddenLocalParts.has(email.split('@')[0].toLowerCase()); } catch { return false; }
}


const freeEmailDomains = new Set(['gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','icloud.com','me.com','aol.com','protonmail.com','pm.me','yandex.com','yandex.ru','zoho.com','gmx.com','gmx.de']);
export function isFreeEmailDomain(email = '') {
try { return freeEmailDomains.has(email.split('@')[1].toLowerCase()); } catch { return false; }
}


export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;




