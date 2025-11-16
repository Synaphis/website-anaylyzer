// === File: server/analysis/safeAnalyze.js ===
import { analyzeWebsite } from '../../lib/analyze.mjs';

export async function safeAnalyzeWebsite(url) {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const analysis = await analyzeWebsite(normalized);
    if (!analysis) throw new Error('Empty analysis result');
    return analysis;
  } catch (err) {
    console.error('Analysis error:', err?.stack || err);
    return {
      url,
      htmlMetrics: { title: 'Analysis Failed', description: '', h1: null, wordCount: 0 },
      metadata: { title: 'Analysis Failed', description: '' },
      keywords: [],
      detectedLinks: {},
      socialProfiles: {},
      accessibility: { violations: 0, details: [] },
      visualMetrics: {},
      performance: { performanceScore: 0 },
      reputation: {},
      analyzedAt: new Date().toISOString(),
      error: err?.message || String(err),
    };
  }
}
