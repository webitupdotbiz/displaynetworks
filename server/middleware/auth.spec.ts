import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockVerifyJwt = jest.fn();
const mockGetJwtSecret = jest.fn().mockReturnValue('test-secret');

jest.unstable_mockModule('./utils/jwt.js', () => ({
  __esModule: true,
  verifyJwt: mockVerifyJwt,
  getJwtSecret: mockGetJwtSecret
}));

const { authMiddleware } = await import('./auth.js');

describe('authMiddleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = { body: {}, query: {}, headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  it('returns 403 when no token is provided', async () => {
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No token provided.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates and calls next when the JWT is valid', async () => {
    mockVerifyJwt.mockResolvedValue({
      user: { id: 'abc', role: 'user', email: 'user@example.com' }
    });
    req.headers['x-access-token'] = 'valid-token';

    await authMiddleware(req, res, next);

    expect(req.user).toEqual({ id: 'abc', role: 'user' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when JWT verification fails', async () => {
    mockVerifyJwt.mockRejectedValue(new Error('invalid token'));
    req.headers['x-access-token'] = 'invalid-token';

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to authenticate token.'
    });
    expect(next).not.toHaveBeenCalled();
  });
});
