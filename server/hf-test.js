// hf-test.js
import dotenv from "dotenv";
dotenv.config({ path: "./.env" }); // make sure .env is in the same folder

import OpenAI from "openai";
import { analyzeWebsite } from "../lib/analyze.mjs";

// ---------- UTIL ----------
function safeStringify(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      if (typeof v === "function") return undefined;
      return v;
    }, 2);
  }
}

// ---------- MAIN ----------
async function testHF() {
  try {
    // check that OPENAI_API_KEY is loaded
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not found in environment!");
    }
    console.log("✅ OPENAI_API_KEY loaded");

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.HF_ROUTER_BASEURL || "https://router.huggingface.co/v1",
    });

    // Get website analysis JSON
    const url = "https://www.nike.com";
    console.log(`✅ Getting analysis JSON for: ${url}`);
    const analysisJSON = await analyzeWebsite(url);
    const safeJSON = safeStringify(analysisJSON);

    // Prompt to LLM
   
const systemMessage = `
You are a senior digital strategy, marketing, and web audit analyst.
Produce a professional, executive-friendly report based on the JSON summary.

Rules:
- Use the JSON as a foundation but infer missing insights logically.
- Do not output raw JSON or list keywords.
- Focus on SEO, social media, website performance, brand recognition, and competitiveness.
- Highlight opportunities to improve client acquisition and engagement.
- Use headings and plain text paragraphs only.

Sections (in order):
Executive Summary
SEO Analysis
Accessibility Review
Performance Review
Social Media and Brand Presence
Visual and Design Assessment
Reputation and Trust Signals
Keyword Strategy (infer only)
Critical Issues
Actionable Recommendations
`;


const userMessage = `
Generate a digital impact analysis report from the JSON below.
Keep the section structure and use plain text paragraphs only (no bullets, tables, or markdown).
Do not mention missing or null fields. Infer business type, products/services, market positioning, and competitiveness.
Focus on SEO, social media, website effectiveness, brand recognition, visitor conversion, and overall digital impact.
Provide actionable insights to improve client acquisition and online presence.

JSON:
${safeJSON}
`;




    console.log("✅ Sending JSON to HuggingFace LLM...");

    const chatCompletion = await client.chat.completions.create({
      model: "meta-llama/Llama-3.1-8B-Instruct:novita",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      max_tokens: 4000,
      temperature: 0.1
    });

    const llmOutput = chatCompletion.choices?.[0]?.message?.content?.trim() || "";
    console.log("\n--- LLM OUTPUT ---\n");
    console.log(llmOutput);

  } catch (err) {
    console.error("Error calling HuggingFace LLM:", err);
  }
}

testHF();
