import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import type { MockFn } from '../types/test.js';

const mockVerifyJwt = jest.fn() as unknown as MockFn<(token: string, secret: string) => Promise<unknown>>;
const mockGetJwtSecret = jest.fn().mockReturnValue('test-secret');

jest.unstable_mockModule('./utils/jwt.js', () => ({
  __esModule: true,
  verifyJwt: mockVerifyJwt,
  getJwtSecret: mockGetJwtSecret
}));

const { authMiddleware } = await import('./auth.js');

type MockResponse = Response & {
  status: MockFn<(code: number) => MockResponse>;
  json: MockFn<(data: unknown) => MockResponse>;
};

describe('authMiddleware', () => {
  let req: Request;
  let res: MockResponse;
  let next: MockFn<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      query: {},
      headers: {}
    } as Request;

    res = {
      status: (jest.fn() as unknown as MockFn<(code: number) => MockResponse>).mockReturnThis(),
      json: (jest.fn() as unknown as MockFn<(data: unknown) => MockResponse>).mockReturnThis()
    } as unknown as MockResponse;

    next = jest.fn() as unknown as MockFn<NextFunction>;
  });

  it('returns 403 when no token is provided', async () => {
    await authMiddleware(req, res, next as unknown as NextFunction);

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

    await authMiddleware(req, res, next as unknown as NextFunction);

    expect((req as Request & { user: unknown }).user).toEqual({ id: 'abc', role: 'user' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when JWT verification fails', async () => {
    mockVerifyJwt.mockRejectedValue(new Error('invalid token'));
    req.headers['x-access-token'] = 'invalid-token';

    await authMiddleware(req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to authenticate token.'
    });
    expect(next).not.toHaveBeenCalled();
  });
});
