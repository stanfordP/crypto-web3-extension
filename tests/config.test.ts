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

    describe('wildcard subdomain matching', () => {
      it('should allow valid single-level subdomains', () => {
        expect(isAllowedOrigin('https://staging.cryptotradingjournal.xyz')).toBe(true);
        expect(isAllowedOrigin('https://api.cryptotradingjournal.xyz')).toBe(true);
        expect(isAllowedOrigin('https://dev.cryptotradingjournal.xyz')).toBe(true);
        expect(isAllowedOrigin('https://test-123.cryptotradingjournal.xyz')).toBe(true);
      });

      it('should reject multi-level subdomains', () => {
        expect(isAllowedOrigin('https://a.b.cryptotradingjournal.xyz')).toBe(false);
        expect(isAllowedOrigin('https://staging.api.cryptotradingjournal.xyz')).toBe(false);
      });

      it('should reject subdomain injection attacks', () => {
        // Attack: malicious.com.cryptotradingjournal.xyz
        expect(isAllowedOrigin('https://malicious.com.cryptotradingjournal.xyz')).toBe(false);
        // Attack: evil.com as subdomain
        expect(isAllowedOrigin('https://evil.com.cryptotradingjournal.xyz')).toBe(false);
      });

      it('should reject domain suffix attacks', () => {
        // Attack: cryptotradingjournal.xyz.evil.com
        expect(isAllowedOrigin('https://cryptotradingjournal.xyz.evil.com')).toBe(false);
        // Attack: subdomain with suffix
        expect(isAllowedOrigin('https://staging.cryptotradingjournal.xyz.evil.com')).toBe(false);
      });

      it('should handle subdomains with hyphens', () => {
        expect(isAllowedOrigin('https://staging-v2.cryptotradingjournal.xyz')).toBe(true);
        expect(isAllowedOrigin('https://api-test.cryptotradingjournal.xyz')).toBe(true);
      });

      it('should reject subdomains with dots in wildcard position', () => {
        // This tests the security fix: [a-zA-Z0-9-]+ instead of [^/]+
        expect(isAllowedOrigin('https://evil.com.cryptotradingjournal.xyz')).toBe(false);
      });

      it('should reject empty subdomains', () => {
        expect(isAllowedOrigin('https://.cryptotradingjournal.xyz')).toBe(false);
      });

      it('should reject special characters in subdomain', () => {
        expect(isAllowedOrigin('https://test!.cryptotradingjournal.xyz')).toBe(false);
        expect(isAllowedOrigin('https://test@.cryptotradingjournal.xyz')).toBe(false);
        expect(isAllowedOrigin('https://test$.cryptotradingjournal.xyz')).toBe(false);
      });

      it('should properly escape regex metacharacters in domain', () => {
        // The dot in domain name should be treated as literal dot, not regex wildcard
        // This is implicitly tested by other tests, but explicitly verify here
        expect(isAllowedOrigin('https://stagingXcryptotradingjournal.xyz')).toBe(false);
      });
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

    describe('wildcard subdomain injection', () => {
      it('should inject on valid single-level subdomains', () => {
        expect(shouldInjectProvider('https://staging.cryptotradingjournal.xyz')).toBe(true);
        expect(shouldInjectProvider('https://api.cryptotradingjournal.xyz')).toBe(true);
      });

      it('should not inject on multi-level subdomains', () => {
        expect(shouldInjectProvider('https://a.b.cryptotradingjournal.xyz')).toBe(false);
      });

      it('should not inject on subdomain injection attacks', () => {
        expect(shouldInjectProvider('https://malicious.com.cryptotradingjournal.xyz')).toBe(false);
        expect(shouldInjectProvider('https://cryptotradingjournal.xyz.evil.com')).toBe(false);
      });
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
