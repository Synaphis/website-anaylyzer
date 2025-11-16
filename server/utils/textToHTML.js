// === File: server/utils/textToHTML.js ===
export function textToHTML(text = '') {
const lines = text.split('\n');
let html = '', currentSection = '';
const headings = [
'Executive Summary',
'SEO Analysis',
'Accessibility Review',
'Performance Review',
'Social Media and Brand Presence',
'Visual and Design Assessment',
'Reputation and Trust Signals',
'Keyword Strategy',
'Critical Issues',
'Actionable Recommendations',
];


for (let line of lines) {
line = line.trim();
if (!line) continue;
const isHeading = headings.find((h) => line.toLowerCase().startsWith(h.toLowerCase()));
if (isHeading) {
if (currentSection) {
html += `<div class="section">${currentSection}</div>`;
currentSection = '';
}
currentSection += `<h2>${line}</h2>`;
continue;
}
if (/^- /.test(line)) {
if (!currentSection.includes('<ul>')) currentSection += '<ul>';
currentSection += `<li>${line.replace(/^- /, '')}</li>`;
} else {
if (currentSection.includes('<ul>')) currentSection += '</ul>';
line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');
currentSection += `<p>${line}</p>`;
}
}
if (currentSection) html += `<div class="section">${currentSection}</div>`;
return html;
}