import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';

const mockSign = jest.fn();
const mockVerify = jest.fn();

jest.unstable_mockModule('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: mockSign,
    verify: mockVerify,
  },
  sign: mockSign,
  verify: mockVerify,
}));

const {
  getJwtSecret,
  getTokenTtlSeconds,
  getAccessTokenTtlSeconds,
  getRefreshTokenTtlSeconds,
  signToken,
  verifyJwt
} = await import('./jwt.js');

type JwtUserPayload = {
  user: {
    id: string;
    role: string;
    email: string;
  };
  iat?: number;
  exp?: number;
};

describe('jwt utility module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getJwtSecret', () => {
    it('returns process.env value when defined and non-empty', () => {
      process.env.TEST_SECRET = 'custom-secret';
      expect(getJwtSecret('TEST_SECRET')).toBe('custom-secret');
    });

    it('throws when process.env value is missing', () => {
      delete process.env.TEST_SECRET;
      expect(() => getJwtSecret('TEST_SECRET')).toThrow('TEST_SECRET must be set to a non-empty value');
    });

    it('throws when process.env value is whitespace', () => {
      process.env.TEST_SECRET = '   ';
      expect(() => getJwtSecret('TEST_SECRET')).toThrow('TEST_SECRET must be set to a non-empty value');
    });
  });

  describe('getTokenTtlSeconds', () => {
    it('returns parsed integer when env var is valid numeric string', () => {
      process.env.TEST_TTL = '3600';
      expect(getTokenTtlSeconds('TEST_TTL', 300)).toBe(3600);
    });

    it('floors floating point values', () => {
      process.env.TEST_TTL = '3600.8';
      expect(getTokenTtlSeconds('TEST_TTL', 300)).toBe(3600);
    });

    it('returns fallback when env var is undefined', () => {
      delete process.env.TEST_TTL;
      expect(getTokenTtlSeconds('TEST_TTL', 300)).toBe(300);
    });

    it('returns fallback when env var is empty or whitespace', () => {
      process.env.TEST_TTL = '   ';
      expect(getTokenTtlSeconds('TEST_TTL', 300)).toBe(300);
    });

    it('returns fallback when env var is non-numeric', () => {
      process.env.TEST_TTL = 'invalid-number';
      expect(getTokenTtlSeconds('TEST_TTL', 300)).toBe(300);
    });

    it('returns fallback when env var is non-positive', () => {
      process.env.TEST_TTL = '0';
      expect(getTokenTtlSeconds('TEST_TTL', 300)).toBe(300);

      process.env.TEST_TTL = '-100';
      expect(getTokenTtlSeconds('TEST_TTL', 300)).toBe(300);
    });
  });

  describe('getAccessTokenTtlSeconds', () => {
    it('reads JWT_ACCESS_TOKEN_TTL from environment', () => {
      process.env.JWT_ACCESS_TOKEN_TTL = '1800';
      expect(getAccessTokenTtlSeconds()).toBe(1800);
    });

    it('falls back to 15 minutes (900 seconds) default', () => {
      delete process.env.JWT_ACCESS_TOKEN_TTL;
      expect(getAccessTokenTtlSeconds()).toBe(900);
    });
  });

  describe('getRefreshTokenTtlSeconds', () => {
    it('reads JWT_REFRESH_TOKEN_TTL from environment', () => {
      process.env.JWT_REFRESH_TOKEN_TTL = '86400';
      expect(getRefreshTokenTtlSeconds()).toBe(86400);
    });

    it('falls back to 7 days (604800 seconds) default', () => {
      delete process.env.JWT_REFRESH_TOKEN_TTL;
      expect(getRefreshTokenTtlSeconds()).toBe(604800);
    });
  });

  describe('signToken', () => {
    it('delegates payload, secret, and options to jwt.sign', () => {
      const payload = { sub: '123' };
      const secret = 'secret';
      const expiresInSeconds = 3600;

      mockSign.mockReturnValue('signed.jwt.token' as any);

      const token = signToken(payload, secret, expiresInSeconds);

      expect(mockSign).toHaveBeenCalledWith(payload, secret, { expiresIn: expiresInSeconds });
      expect(token).toBe('signed.jwt.token');
    });
  });

  describe('verifyJwt', () => {
    it('resolves decoded payload when jwt.verify succeeds', async () => {
      const expectedPayload: JwtUserPayload = {
        user: { id: '123', role: 'admin', email: 'test@example.com' },
        iat: 1,
        exp: 2
      };

      mockVerify.mockImplementation((token, secret, callback?: any) => {
        if (callback) callback(null, expectedPayload);
        return expectedPayload as any;
      });

      const result = await verifyJwt('my.token.here', 'secret');

      expect(mockVerify).toHaveBeenCalledWith('my.token.here', 'secret', expect.any(Function));
      expect(result).toEqual(expectedPayload);
    });

    it('rejects with an error when jwt.verify fails', async () => {
      const expectedError = new Error('invalid token');

      mockVerify.mockImplementation((token, secret, callback?: any) => {
        if (callback) callback(expectedError, null);
        return undefined as any;
      });

      await expect(verifyJwt('invalid.token', 'secret')).rejects.toThrow('invalid token');
      expect(mockVerify).toHaveBeenCalledWith('invalid.token', 'secret', expect.any(Function));
    });
  });
});
