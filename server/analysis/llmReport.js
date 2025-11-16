import OpenAI from 'openai';


const systemMessage = `
You are a senior virtual strategy, marketing, and web audit analyst.
Produce a professional, executive-friendly report based ONLY on the provided JSON.
Purpose: Convert raw website scan data into a clear, persuasive, and actionable digital business snapshot that shows what the business does, its website performance, technologies used, SEO, content, competitors, and overall online presence. The report should help with instant lead generation.


Hard rules:
- Use the exact section headings and order below. Do not add, remove, rename, or reorder headings.
- Each heading must appear on its own line followed by a plain-text paragraph (no bullets, tables, markdown).
- Use only the JSON. Never claim to have visited or crawled the live site or used external sources.
- If you infer any insight not directly present, mark it inline as: INFERRED (confidence: XX%) with a brief explanation if needed.
- Numeric estimates must include value and confidence inline, e.g., (~31, confidence 78%).
- Do not exaggerate performance, traffic, or impact. Be optimistic but accurate within the data and inferences.
- If data completeness < 20% start with: "Partial scan — high uncertainty."
- Keep tone professional, factual, and actionable, suitable for leads.


Sections (exact, in order):
Executive Summary
SEO Analysis
Accessibility Review
Performance Review
Social Media and Brand Presence
Visual and Design Assessment
Reputation and Trust Signals
Keyword Strategy
Critical Issues
Actionable Recommendations
`;


export async function generateReportWithData(data) {
try {
const client = new OpenAI({ baseURL: process.env.HF_ROUTER_BASEURL || 'https://router.huggingface.co/v1', apiKey: process.env.OPENAI_API_KEY });
const model = process.env.HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct:novita';
const userMessage = `
Generate a virtual and business insight report from the JSON below.
Use only the provided JSON. Do not output raw JSON, bullets, lists, tables, or markdown.
Keep the headings exactly as listed in the system message, each followed by a plain-text paragraph only.
Do not claim external knowledge; base all statements solely on JSON.
If you make inferences, label them inline as INFERRED (confidence: XX%) and provide numeric estimates with confidence inline.
Focus on revealing the business model, products/services, website effectiveness, technology stack, SEO, content, online presence, competitors, and overall digital health. Provide actionable insights for client acquisition and online presence improvement.
Do not exaggerate or make claims beyond what the data and logical inference support.
If data completeness < 20%, start with "Partial scan — high uncertainty."


JSON Input:
${JSON.stringify(data)}
`;
const response = await client.chat.completions.create({ model, messages: [{ role: 'system', content: systemMessage }, { role: 'user', content: userMessage }], max_tokens: 4000, temperature: 0.1 });
const text = response.choices?.[0]?.message?.content?.trim();
if (!text) throw new Error('LLM returned no report text');
return text;
} catch (err) {
console.error('LLM generation failed:', err?.stack || err);
return `Executive Summary\nUnable to generate report due to API error.\n\nSEO Analysis\nN/A\n\nAccessibility Review\nN/A\n\nPerformance Review\nN/A\n\nSocial Media and Brand Presence\nN/A\n\nVisual and Design Assessment\nN/A\n\nReputation and Trust Signals\nN/A\n\nKeyword Strategy\nN/A\n\nCritical Issues\nN/A\n\nActionable Recommendations\nN/A`;
}
}