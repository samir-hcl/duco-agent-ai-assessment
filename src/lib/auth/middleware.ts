import { NextRequest, NextResponse } from 'next/server';

/**
 * API Authentication & Authorization Middleware
 *
 * Validates requests to protected API routes using API key authentication.
 * - Read-only routes (GET /api/codes/*) are public — no auth required.
 * - Mutation routes (POST /api/orchestrate, /api/approve, /api/rules/*) require
 *   a valid API key passed via the `x-api-key` header or `Authorization: Bearer <key>`.
 *
 * In development mode, if no DUCO_API_KEY is set in .env.local, all requests
 * are allowed with a logged warning (to avoid blocking local development).
 *
 * Security Model:
 * - Follows least-privilege: only authenticated callers can trigger pipeline execution
 *   or approve/reject claims. Read-only code lookups remain open.
 * - API key is never hardcoded — loaded exclusively from process.env.
 * - Rate limiting: basic per-IP rate limiting (10 requests/minute) on mutation routes.
 */

// In-memory rate limiter (per-IP, resets every 60 seconds)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Validates the API key from the request.
 * Accepts the key via `x-api-key` header or `Authorization: Bearer <key>`.
 */
function extractApiKey(request: NextRequest): string | null {
  // Check x-api-key header first
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader) return apiKeyHeader;

  // Check Authorization: Bearer <key>
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export interface AuthResult {
  authorized: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Main authentication function.
 * Call this at the top of any protected API route handler.
 *
 * @param request - The incoming NextRequest
 * @returns AuthResult indicating whether the request is authorized
 */
export function authenticateRequest(request: NextRequest): AuthResult {
  const configuredKey = process.env.DUCO_API_KEY;

  // Development mode: if no API key is configured, allow all requests
  // but log a security warning
  if (!configuredKey) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV) {
      console.warn(
        '[AUTH] ⚠️  No DUCO_API_KEY configured. All requests allowed in development mode. ' +
        'Set DUCO_API_KEY in .env.local for production security.'
      );
      return { authorized: true };
    }
    // In production without a key configured, deny by default
    return {
      authorized: false,
      error: 'Server misconfiguration: API key not set',
      statusCode: 500,
    };
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return {
      authorized: false,
      error: 'Rate limit exceeded. Maximum 10 requests per minute.',
      statusCode: 429,
    };
  }

  // Validate API key
  const providedKey = extractApiKey(request);
  if (!providedKey) {
    return {
      authorized: false,
      error: 'Authentication required. Provide API key via x-api-key header or Authorization: Bearer <key>',
      statusCode: 401,
    };
  }

  // Constant-time comparison to prevent timing attacks
  if (providedKey.length !== configuredKey.length) {
    return { authorized: false, error: 'Invalid API key', statusCode: 403 };
  }

  let mismatch = 0;
  for (let i = 0; i < providedKey.length; i++) {
    mismatch |= providedKey.charCodeAt(i) ^ configuredKey.charCodeAt(i);
  }

  if (mismatch !== 0) {
    return { authorized: false, error: 'Invalid API key', statusCode: 403 };
  }

  return { authorized: true };
}

/**
 * Helper: returns a NextResponse error if authentication fails.
 * Returns null if authentication succeeds (caller should proceed).
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.statusCode || 403 }
    );
  }
  return null;
}
