// === File: server/middleware/rateLimiter.js ===
import rateLimit from 'express-rate-limit';
export const requestLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { error: 'Too many requests. Wait a few minutes.' } });