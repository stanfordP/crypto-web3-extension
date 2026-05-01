import {
  mergeSession,
  parseApiSessionResponse,
  sessionsEqual,
} from '../core/session/SessionManager';

describe('SessionManager helpers', () => {
  describe('parseApiSessionResponse', () => {
    it('should recover userId from nested user data and normalize numeric chainId', () => {
      const result = parseApiSessionResponse({
        authenticated: true,
        data: {
          authenticated: true,
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chainId: 1,
          expiresAt: '2026-05-01T00:00:00.000Z',
          user: {
            id: 'user-123',
          },
        },
      });

      expect(result).toEqual({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: '0x1',
        userId: 'user-123',
        expiresAt: Date.parse('2026-05-01T00:00:00.000Z'),
      });
    });

    it('should recover userId from snake_case alias', () => {
      const result = parseApiSessionResponse({
        authenticated: true,
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: '0x89',
        user_id: 'user-snake',
      });

      expect(result).toEqual({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: '0x89',
        userId: 'user-snake',
        expiresAt: undefined,
      });
    });
  });

  describe('sessionsEqual', () => {
    it('should treat different userIds as a session change', () => {
      expect(
        sessionsEqual(
          {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            chainId: '0x1',
            sessionToken: 'token-1',
            userId: 'user-a',
          },
          {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            chainId: '0x1',
            sessionToken: 'token-1',
            userId: 'user-b',
          }
        )
      ).toBe(false);
    });
  });

  describe('mergeSession', () => {
    it('should preserve incoming userId when merging', () => {
      const result = mergeSession(
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chainId: '0x1',
          sessionToken: 'token-1',
        },
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chainId: '0x1',
          userId: 'user-merged',
        }
      );

      expect(result).toEqual({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: '0x1',
        sessionToken: 'token-1',
        userId: 'user-merged',
        connectedAt: undefined,
        expiresAt: undefined,
      });
    });

    it('should not preserve existing userId when incoming address changes without userId', () => {
      const result = mergeSession(
        {
          address: '0x1111111111111111111111111111111111111111',
          chainId: '0x1',
          sessionToken: 'token-1',
          userId: 'old-user',
        },
        {
          address: '0x2222222222222222222222222222222222222222',
          chainId: '0x1',
          sessionToken: 'token-2',
        }
      );

      expect(result).toEqual({
        address: '0x2222222222222222222222222222222222222222',
        chainId: '0x1',
        sessionToken: 'token-2',
        connectedAt: undefined,
        expiresAt: undefined,
      });
    });
  });
});