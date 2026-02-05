/**
 * Centralized Configuration for the Web3 Extension
 *
 * All URLs, origins, and environment-specific settings are defined here.
 * This makes it easy to update for production deployment.
 */

// ============================================================================
// Environment Detection
// ============================================================================

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

// ============================================================================
// API Configuration
// ============================================================================

/**
 * Environment-specific API URLs
 */
const API_URLS = {
  development: 'http://localhost:3000',
  production: 'https://cryptotradingjournal.xyz',
  staging: 'https://staging.cryptotradingjournal.xyz',
} as const;

/**
 * Main application API base URL
 * Priority: ENV variable > environment-based default
 */
export const API_BASE_URL =
  process.env.API_BASE_URL ||
  (IS_PRODUCTION ? API_URLS.production : API_URLS.development);

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  SIWE_CHALLENGE: '/api/auth/siwe/challenge',
  SIWE_VERIFY: '/api/auth/siwe/verify',
  SESSION_VALIDATE: '/api/auth/session',
  DISCONNECT: '/api/auth/disconnect',
} as const;

// ============================================================================
// Allowed Origins
// ============================================================================

/**
 * Origins allowed to communicate with the extension
 * These should match manifest.json host_permissions
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://localhost:3001', // Test ground mock server
  'https://cryptotradingjournal.xyz',
  'https://www.cryptotradingjournal.xyz',
  'https://*.cryptotradingjournal.xyz', // Subdomains
] as const;

/**
 * Origins where the provider should be injected
 * Content script will only inject on these pages
 */
export const INJECTION_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'https://cryptotradingjournal.xyz',
  'https://www.cryptotradingjournal.xyz',
  'https://*.cryptotradingjournal.xyz',
] as const;

/**
 * Convert an origin pattern with '*' wildcards into a safe regular expression.
 * Escapes all regex metacharacters and replaces all '*' segments with a
 * subpattern that matches a non-empty sequence of non-slash characters.
 */
function wildcardOriginToRegExp(pattern: string): RegExp {
  // First escape all regex metacharacters
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Then replace all escaped '*' characters with the wildcard subpattern
  const withWildcards = escaped.replace(/\\\*/g, '[^/]+');
  return new RegExp(`^${withWildcards}$`);
}

/**
 * Check if an origin is allowed
 */
export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed.includes('*')) {
      // Handle wildcard subdomains
      return wildcardOriginToRegExp(allowed).test(origin);
    }
    return origin === allowed || origin.startsWith(allowed.replace('/*', ''));
  });
}

/**
 * Check if provider should be injected on this origin
 */
export function shouldInjectProvider(origin: string): boolean {
  return INJECTION_ORIGINS.some((allowed) => {
    if (allowed.includes('*')) {
      return wildcardOriginToRegExp(allowed).test(origin);
    }
    return origin === allowed || origin.startsWith(allowed.replace('/*', ''));
  });
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Provider identification for EIP-6963
 */
export const PROVIDER_INFO = {
  uuid: 'crypto-journal-web3-extension-v1',
  name: 'Crypto Trading Journal',
  rdns: 'com.cryptojournal.wallet',
  // SVG icon as data URI (matches assets/favicon.svg style)
  icon: `data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='iconGold' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23d4af37'/%3E%3Cstop offset='50%25' stop-color='%23f4e4a6'/%3E%3Cstop offset='100%25' stop-color='%23c9a227'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' fill='%230f172a' rx='6'/%3E%3Ctext x='2' y='24' font-family='Georgia,serif' font-size='26' font-weight='400' fill='url(%23iconGold)'%3EC%3C/text%3E%3Ctext x='14' y='24' font-family='Georgia,serif' font-size='26' font-weight='400' fill='url(%23iconGold)'%3EJ%3C/text%3E%3Ccircle cx='11' cy='15' r='5' fill='none' stroke='%23d4af37' stroke-width='0.8' opacity='0.6'/%3E%3C/svg%3E`,
} as const;

// ============================================================================
// Timeouts and Limits
// ============================================================================

export const TIMEOUTS = {
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT: 60_000,
  /** Rate limit window in milliseconds */
  RATE_LIMIT_WINDOW: 500,
  /** Session token expiry (24 hours) */
  SESSION_EXPIRY: 24 * 60 * 60 * 1000,
  /** Nonce expiry (5 minutes) */
  NONCE_EXPIRY: 5 * 60 * 1000,
  /** Keep-alive alarm interval in minutes (must be < 0.5 for 30s threshold) */
  KEEPALIVE_INTERVAL_MINUTES: 0.4,
  /** Maximum operation time before timeout (5 minutes) */
  OPERATION_TIMEOUT: 5 * 60 * 1000,
  /** Health check timeout in milliseconds */
  HEALTH_CHECK_TIMEOUT: 2000,
  /** Service worker wake-up retry base delay */
  WAKE_RETRY_BASE_DELAY: 300,
  /** Port operation timeout (2 minutes) */
  PORT_OPERATION_TIMEOUT: 2 * 60 * 1000,
} as const;

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULTS = {
  /** Default chain ID (Ethereum Mainnet) */
  CHAIN_ID: '0x1',
  /** Default account mode */
  ACCOUNT_MODE: 'live' as const,
  /** Dashboard path for opening app */
  DASHBOARD_PATH: '/dashboard',
} as const;

// ============================================================================
// Feature Flags
// ============================================================================

export const FEATURES = {
  /** Enable debug logging */
  DEBUG_LOGGING: !IS_PRODUCTION,
  /** Enable request deduplication */
  REQUEST_DEDUPLICATION: true,
  /** Enable EIP-6963 multi-wallet announcement */
  EIP6963_ANNOUNCEMENT: true,
  /** Enable error reporting to backend */
  ERROR_REPORTING: IS_PRODUCTION,
  /** Error reporting endpoint - uses main app API */
  ERROR_REPORTING_ENDPOINT: IS_PRODUCTION
    ? `${API_URLS.production}/api/extension/errors`
    : undefined,
  /** Enable rate limiting */
  RATE_LIMITING: true,
  /** Enable security extension compatibility mode */
  SECURITY_EXTENSION_COMPAT: true,
} as const;

// ============================================================================
// Error Reporting Configuration
// ============================================================================

export const ERROR_REPORTING_CONFIG = {
  /** Maximum errors to batch before sending */
  BATCH_SIZE: 10,
  /** Milliseconds to wait before sending a batch */
  BATCH_DELAY_MS: 5000,
  /** Maximum errors to keep in offline queue */
  MAX_QUEUE_SIZE: 100,
  /** Include stack traces in reports */
  INCLUDE_STACK_TRACE: IS_PRODUCTION,
  /** Sanitize URLs (remove query params) */
  SANITIZE_URLS: true,
  /** Max errors per minute (rate limiting) */
  MAX_ERRORS_PER_MINUTE: 100,
} as const;

// ============================================================================
// Config Export Object (for easy access in modules)
// ============================================================================

export const CONFIG = {
  IS_PRODUCTION,
  IS_DEVELOPMENT,
  API_BASE_URL,
  API_ENDPOINTS,
  ALLOWED_ORIGINS,
  INJECTION_ORIGINS,
  PROVIDER_INFO,
  TIMEOUTS,
  DEFAULTS,
  FEATURES,
  ERROR_REPORTING: ERROR_REPORTING_CONFIG,
} as const;
