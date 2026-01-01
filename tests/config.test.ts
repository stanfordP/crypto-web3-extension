/**
 * Unit Tests for Config
 */

import { 
  isAllowedOrigin, 
  shouldInjectProvider,
  ALLOWED_ORIGINS,
  INJECTION_ORIGINS,
  PROVIDER_INFO,
  API_BASE_URL,
  API_ENDPOINTS,
  TIMEOUTS,
  DEFAULTS,
} from '../src/scripts/config';

describe('Config', () => {
  describe('Constants', () => {
    it('should have valid API_BASE_URL', () => {
      expect(API_BASE_URL).toBeDefined();
      expect(typeof API_BASE_URL).toBe('string');
    });

    it('should have all API endpoints defined', () => {
      expect(API_ENDPOINTS.SIWE_CHALLENGE).toBeDefined();
      expect(API_ENDPOINTS.SIWE_VERIFY).toBeDefined();
      expect(API_ENDPOINTS.SESSION_VALIDATE).toBeDefined();
      expect(API_ENDPOINTS.DISCONNECT).toBeDefined();
    });

    it('should have valid PROVIDER_INFO', () => {
      expect(PROVIDER_INFO.uuid).toBeDefined();
      expect(PROVIDER_INFO.name).toBe('Crypto Trading Journal');
      expect(PROVIDER_INFO.rdns).toBe('com.cryptojournal.wallet');
      expect(PROVIDER_INFO.icon).toContain('data:image/svg+xml');
    });

    it('should have valid timeouts', () => {
      expect(TIMEOUTS.REQUEST_TIMEOUT).toBeGreaterThan(0);
      expect(TIMEOUTS.RATE_LIMIT_WINDOW).toBeGreaterThan(0);
      expect(TIMEOUTS.SESSION_EXPIRY).toBeGreaterThan(0);
    });

    it('should have valid defaults', () => {
      expect(DEFAULTS.CHAIN_ID).toBe('0x1');
      expect(DEFAULTS.ACCOUNT_MODE).toBe('live');
    });
  });

  describe('isAllowedOrigin', () => {
    it('should allow localhost:3000', () => {
      expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    });

    it('should allow localhost:3001', () => {
      expect(isAllowedOrigin('http://localhost:3001')).toBe(true);
    });

    it('should reject unknown origins', () => {
      expect(isAllowedOrigin('https://malicious-site.com')).toBe(false);
      expect(isAllowedOrigin('http://evil.com')).toBe(false);
    });

    it('should handle production domain', () => {
      expect(isAllowedOrigin('https://cryptotradingjournal.xyz')).toBe(true);
    });
  });

  describe('shouldInjectProvider', () => {
    it('should inject on localhost:3000', () => {
      expect(shouldInjectProvider('http://localhost:3000')).toBe(true);
    });

    it('should not inject on random sites', () => {
      expect(shouldInjectProvider('https://google.com')).toBe(false);
      expect(shouldInjectProvider('https://github.com')).toBe(false);
    });

    it('should inject on production domain', () => {
      expect(shouldInjectProvider('https://cryptotradingjournal.xyz')).toBe(true);
    });
  });

  describe('ALLOWED_ORIGINS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ALLOWED_ORIGINS)).toBe(true);
    });

    it('should contain localhost entries', () => {
      expect(ALLOWED_ORIGINS.some(o => o.includes('localhost'))).toBe(true);
    });
  });

  describe('INJECTION_ORIGINS', () => {
    it('should be an array', () => {
      expect(Array.isArray(INJECTION_ORIGINS)).toBe(true);
    });

    it('should be subset of or equal to ALLOWED_ORIGINS conceptually', () => {
      // Injection origins should generally be places where we want the provider
      expect(INJECTION_ORIGINS.length).toBeGreaterThan(0);
    });
  });
});
