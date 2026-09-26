import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Request, Response } from 'express';

const mockSendEmail = jest.fn<(mailOptions: unknown) => void>();
const mockNotifyUserStatusChanged = jest.fn<(userId: string, active: boolean) => void>();
const mockSign = jest.fn<(...args: unknown[]) => string>().mockReturnValue('jwt-token');
const mockVerify = jest.fn<(...args: unknown[]) => unknown>();
const mockGenSalt = jest.fn<() => Promise<string>>().mockResolvedValue('salt');
const mockHash = jest.fn<(pass: string, salt: number | string) => Promise<string>>().mockResolvedValue('hashed-password');
const mockCompare = jest.fn<(pass: string, hash: string) => Promise<boolean>>().mockResolvedValue(true);
const mockGetAccessTokenTtlSeconds = jest.fn<() => number>().mockReturnValue(3600);
const mockGetRefreshTokenTtlSeconds = jest.fn<() => number>().mockReturnValue(86400);
const mockGetJwtSecret = jest.fn<(envName: string) => string>().mockReturnValue('secret');
const mockSignToken = jest.fn<(payload: object, secret: string, ttl: number) => string>();

jest.unstable_mockModule('../services/emailService.js', () => ({
  __esModule: true,
  default: mockSendEmail
}));

jest.unstable_mockModule('../services/channel.socket.js', () => ({
  __esModule: true,
  notifyUserStatusChanged: mockNotifyUserStatusChanged
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: mockSign,
    verify: mockVerify
  },
  sign: mockSign,
  verify: mockVerify
}));

jest.unstable_mockModule('bcryptjs', () => ({
  __esModule: true,
  default: {
    genSalt: mockGenSalt,
    hash: mockHash,
    compare: mockCompare
  },
  genSalt: mockGenSalt,
  hash: mockHash,
  compare: mockCompare
}));

jest.unstable_mockModule('node:crypto', () => ({
  __esModule: true,
  default: {
    createHash: jest.fn<() => unknown>().mockReturnValue({
      update: jest.fn<() => unknown>().mockReturnValue({
        digest: jest.fn<() => string>().mockReturnValue('hashed-reset-token')
      })
    }),
    randomBytes: jest.fn<(size: unknown, cb?: unknown) => void>().mockImplementation((size: unknown, cb?: unknown) => {
      if (typeof cb === 'function') {
        cb(null, Buffer.from('a'.repeat(typeof size === 'number' ? size : 20)));
      }
    })
  },
  createHash: jest.fn<() => unknown>().mockReturnValue({
    update: jest.fn<() => unknown>().mockReturnValue({
      digest: jest.fn<() => string>().mockReturnValue('hashed-reset-token')
    })
  }),
  randomBytes: jest.fn<(size: unknown, cb?: unknown) => void>().mockImplementation((size: unknown, cb?: unknown) => {
    if (typeof cb === 'function') {
      cb(null, Buffer.from('a'.repeat(typeof size === 'number' ? size : 20)));
    }
  })
}));

jest.unstable_mockModule('../middleware/utils/jwt.js', () => ({
  __esModule: true,
  getAccessTokenTtlSeconds: mockGetAccessTokenTtlSeconds,
  getRefreshTokenTtlSeconds: mockGetRefreshTokenTtlSeconds,
  getJwtSecret: mockGetJwtSecret,
  signToken: mockSignToken
}));

const { default: UserCtrl } = await import('./user.js');
const sendEmail = (await import('../services/emailService.js')).default;

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
  sendStatus: jest.Mock;
  header: jest.Mock;
};

interface ExecQuery<T> {
  exec: jest.Mock<() => Promise<T>>;
}

interface MockModel {
  (data: Record<string, unknown>): { save: jest.Mock<() => Promise<Record<string, unknown>>> };
  countDocuments: jest.Mock<(params?: unknown) => Promise<number>>;
  find: jest.Mock<(params?: unknown) => { limit: jest.Mock; sort: jest.Mock }>;
  findOne: jest.Mock<(params?: unknown) => ExecQuery<Record<string, unknown> | null>>;
  findOneAndUpdate: jest.Mock<(filter?: unknown, update?: unknown) => ExecQuery<Record<string, unknown>>>;
  findById: jest.Mock<(id?: unknown) => { lean: jest.Mock; exec: jest.Mock<() => Promise<Record<string, unknown> | null>> }>;
}

const createResponse = (): MockResponse => ({
  status: jest.fn<() => MockResponse>().mockReturnThis(),
  json: jest.fn<() => MockResponse>().mockReturnThis(),
  sendStatus: jest.fn<() => MockResponse>().mockReturnThis(),
  header: jest.fn<() => MockResponse>().mockReturnThis()
} as unknown as MockResponse);

const createRequest = (
  params: Record<string, unknown> = {},
  body: Record<string, unknown> = {},
  user: Record<string, unknown> = {},
  query: Record<string, unknown> = {}
): Request => ({
  params,
  body,
  user,
  query
} as unknown as Request);

describe('UserCtrl', () => {
  let controller: InstanceType<typeof UserCtrl>;
  let model: MockModel;
  let constructorFn: jest.Mock<(data: Record<string, unknown>) => { id: string; save: jest.Mock<() => Promise<Record<string, unknown>>> }>;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockCompare.mockResolvedValue(true);
    mockGetJwtSecret.mockReturnValue('secret');

    constructorFn = jest.fn<(data: Record<string, unknown>) => { id: string; save: jest.Mock<() => Promise<Record<string, unknown>>> }>().mockImplementation((data) => ({
      ...data,
      id: 'new-user',
      save: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({ id: 'new-user', ...data })
    }));

    const execResult = <T>(value: T): ExecQuery<T> => ({ exec: jest.fn<() => Promise<T>>().mockResolvedValue(value) });

    const mockFindChain = {
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue([{ id: 'user1' }])
    };

    const mockLeanChain = {
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ id: 'user1', password: 'secret', role: 'user' })
    };

    model = Object.assign(constructorFn, {
      countDocuments: jest.fn<(params?: unknown) => Promise<number>>().mockResolvedValue(2),
      find: jest.fn<(params?: unknown) => typeof mockFindChain>().mockReturnValue(mockFindChain),
      findOne: jest.fn<(params?: unknown) => ExecQuery<Record<string, unknown> | null>>().mockReturnValue(execResult(null)),
      findOneAndUpdate: jest.fn<(filter?: unknown, update?: unknown) => ExecQuery<Record<string, unknown>>>().mockReturnValue(execResult({})),
      findById: jest.fn<(id?: unknown) => typeof mockLeanChain>().mockReturnValue(mockLeanChain)
    });

    controller = new UserCtrl();
    controller.model = model as unknown as typeof controller.model;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('getAll returns filtered users for admin and handles params', async () => {
    const req = createRequest({ last: 'lastid' }, {}, { role: 'admin', id: 'admin-id' }, { term: 'search.*' });
    const res = createResponse();

    await controller.getAll(req, res);

    expect(model.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ search: expect.any(RegExp), role: 'groupadmin', _id: { $lt: 'lastid' } }));
    expect(model.find).toHaveBeenCalledWith(expect.objectContaining({ search: expect.any(RegExp), role: 'groupadmin', _id: { $lt: 'lastid' } }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ count: 2, users: [{ id: 'user1' }] });
  });

  it('getAll returns 400 on error', async () => {
    model.countDocuments.mockRejectedValueOnce(new Error('getAll error'));
    const req = createRequest();
    const res = createResponse();

    await controller.getAll(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'getAll error' });
  });

  it('login returns 403 when user is not found', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue(null) });
    const req = createRequest({}, { email: 'missing@example.com', password: 'pass' });
    const res = createResponse();

    await controller.login(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });

  it('login returns 403 when password does not match', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ id: '1', _id: '1', role: 'user', email: 'a@b.com', password: 'hashed' }) });
    mockCompare.mockResolvedValueOnce(false);
    const req = createRequest({}, { email: 'a@b.com', password: 'wrong' });
    const res = createResponse();

    await controller.login(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });

  it('login returns 500 if JWT secrets are misconfigured or empty', async () => {
    mockGetJwtSecret.mockReturnValueOnce('  ');
    const req = createRequest({}, { email: 'a@b.com', password: 'secret' });
    const res = createResponse();

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'JWT secrets misconfigured' });
  });

  it('login signs access and refresh tokens and returns 200 when credentials are valid', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ id: '1', _id: '1', role: 'user', email: 'a@b.com', password: 'hashed' }) });
    model.findOneAndUpdate.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}) });
    mockSignToken
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    const req = createRequest({}, { email: 'a@b.com', password: 'secret' });
    const res = createResponse();

    await controller.login(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ _id: '1' }, { active: true });
    expect(mockNotifyUserStatusChanged).toHaveBeenCalledWith('1', true);
    expect(mockSignToken).toHaveBeenNthCalledWith(1, { user: { id: '1', role: 'user', email: 'a@b.com' } }, expect.any(String), expect.any(Number));
    expect(mockSignToken).toHaveBeenNthCalledWith(2, { user: { id: '1', role: 'user', email: 'a@b.com' } }, expect.any(String), expect.any(Number));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('refresh rotates tokens when the refresh token is valid', async () => {
    mockVerify.mockReturnValueOnce({ user: { id: '1', role: 'user', email: 'a@b.com' } });
    model.findById.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ id: '1', _id: '1', role: 'user', email: 'a@b.com' })
    });
    mockSignToken
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');

    const req = createRequest({}, { refreshToken: 'valid-refresh-token' });
    const res = createResponse();

    await controller.refresh(req, res);

    expect(mockVerify).toHaveBeenCalledWith('valid-refresh-token', expect.any(String));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
  });

  it('refresh returns 401 if decoded payload fails isUserJwtPayload validation', async () => {
    mockVerify.mockReturnValueOnce({ user: { id: '1' } });
    const req = createRequest({}, { refreshToken: 'invalid-payload-token' });
    const res = createResponse();

    await controller.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token payload' });
    expect(mockSignToken).not.toHaveBeenCalled();
  });

  it('refresh rejects a request without a refresh token without minting tokens', async () => {
    const req = createRequest({}, {});
    const res = createResponse();

    await controller.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid refresh token' });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSignToken).not.toHaveBeenCalled();
  });

  it('refresh logs the JWT error class and returns a generic 401 when verification fails', async () => {
    mockVerify.mockImplementationOnce(() => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      throw error;
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const req = createRequest({}, { refreshToken: 'expired-refresh-token' });
    const res = createResponse();

    await controller.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired refresh token' });
    expect(errorSpy).toHaveBeenCalledWith('Refresh token verification failed: TokenExpiredError');
    expect(mockSignToken).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('refresh rejects a verified token when its user no longer exists without minting tokens', async () => {
    mockVerify.mockReturnValueOnce({ user: { id: 'deleted-user', role: 'user', email: 'deleted@example.com' } });
    model.findById.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue(null)
    });
    const req = createRequest({}, { refreshToken: 'valid-refresh-token' });
    const res = createResponse();

    await controller.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    expect(mockSignToken).not.toHaveBeenCalled();
  });

  it('login does not emit status update when user is already active', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ id: '1', _id: '1', role: 'user', email: 'a@b.com', password: 'hashed', active: true }) });
    const req = createRequest({}, { email: 'a@b.com', password: 'secret' });
    const res = createResponse();

    await controller.login(req, res);

    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockNotifyUserStatusChanged).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('login returns 500 when findOne throws', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockRejectedValue(new Error('login fail')) });
    const req = createRequest({}, { email: 'a@b.com', password: 'secret' });
    const res = createResponse();

    await controller.login(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(500);
  });

  it('sendResetEmail calls sendEmail with reset subject', () => {
    process.env.SEND_EMAIL_NAME = 'App';
    process.env.SEND_EMAIL_ADDRESS = 'noreply@example.com';

    controller.sendResetEmail('https://app', 'user@example.com', 'token123');

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Account Password Reset', to: 'user@example.com' }));
  });

  it('sendInviteEmail uses correct subject for admin invite', () => {
    process.env.SEND_EMAIL_NAME = 'App';
    process.env.SEND_EMAIL_ADDRESS = 'invite@example.com';

    controller.sendInviteEmail(true, 'https://app', 'invite@example.com', 'token123');

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Group Admin Invitation' }));
  });

  it('sendInviteEmail uses correct subject for group member invite', () => {
    controller.sendInviteEmail(false, 'https://app', 'invite@example.com', 'token123');

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Group Member Invitation' }));
  });

  it('reset returns 403 when user is not found', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue(null) });
    const req = createRequest({}, { email: 'missing@example.com' });
    const res = createResponse();

    await controller.reset(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });

  it('reset updates user and sends reset email', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ _id: '1', email: 'a@b.com' }) });
    const spy = jest.spyOn(controller, 'sendResetEmail').mockImplementation(() => undefined);
    const req = createRequest({}, { email: 'a@b.com', origin: 'https://app' });
    const res = createResponse();

    await controller.reset(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '1' },
      expect.objectContaining({ resetPasswordToken: 'hashed-reset-token' })
    );
    expect(spy).toHaveBeenCalledWith('https://app', 'a@b.com', expect.any(String));
    expect(res.json).toHaveBeenCalledWith({});
  });

  it('reset returns 500 on error', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockRejectedValue(new Error('reset error')) });
    const req = createRequest({}, { email: 'a@b.com' });
    const res = createResponse();

    await controller.reset(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(500);
  });

  it('doReset returns 400 when password is missing', async () => {
    const req = createRequest({ token: 'abc' }, {});
    const res = createResponse();

    await controller.doReset(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(400);
  });

  it('doReset returns 400 when token is invalid', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue(null) });
    const req = createRequest({ token: 'abc' }, { password: 'newpass' });
    const res = createResponse();

    await controller.doReset(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(400);
  });

  it('doReset updates password and returns sanitized user', async () => {
    const userObject = { id: '1', _id: '1', resetPasswordToken: 'hashed-reset-token', resetPasswordExpires: Date.now() + 10000 };
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue(userObject) });
    model.findOneAndUpdate.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}) });
    model.findById.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ id: '1', password: 'hashed', role: 'user' })
    });
    const req = createRequest({ token: 'abc' }, { password: 'newpass' });
    const res = createResponse();

    await controller.doReset(req, res);

    expect(model.findOne).toHaveBeenCalledWith(expect.objectContaining({ resetPasswordToken: 'hashed-reset-token' }));
    expect(mockHash).toHaveBeenCalledWith('newpass', 10);
    expect(mockNotifyUserStatusChanged).toHaveBeenCalledWith('1', true);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: '1', role: 'user' });
  });

  it('showReset returns 400 when user not found', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue(null) });
    const req = createRequest({ token: 'abc' });
    const res = createResponse();

    await controller.showReset(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(400);
  });

  it('showReset returns 200 when user is found', async () => {
    model.findOne.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ id: '1' }) });
    const req = createRequest({ token: 'abc' });
    const res = createResponse();

    await controller.showReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: '1' });
  });

  it('insert creates a user and sends invite email', async () => {
    const spy = jest.spyOn(controller, 'sendInviteEmail').mockImplementation(() => undefined);
    const req = createRequest({}, { origin: 'https://app', data: { email: 'newuser@example.com' } }, { role: 'admin' });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).toHaveBeenCalledWith(expect.objectContaining({ email: 'newuser@example.com', role: 'groupadmin' }));
    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-user', email: 'newuser@example.com' }));
  });

  it('insert returns 400 on save error', async () => {
    constructorFn.mockImplementationOnce(() => ({
      id: 'new-user',
      save: jest.fn<() => Promise<Record<string, unknown>>>().mockRejectedValueOnce(new Error('insert fail'))
    }));
    const req = createRequest({}, { origin: 'https://app', data: { email: 'bad@example.com' } }, { role: 'admin' });
    const res = createResponse();

    await controller.insert(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'insert fail' });
  });

  it('sendInvite resends an invite to the recipient using sender role and recipient id', async () => {
    const spy = jest.spyOn(controller, 'sendInviteEmail').mockImplementation(() => undefined);
    const req = createRequest({}, { origin: 'https://app', userId: 'recipient-id' }, { role: 'groupadmin', id: 'sender-id' });
    const res = createResponse();

    model.findById.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn<() => Promise<Record<string, unknown> | null>>().mockResolvedValue({ _id: 'recipient-id', email: 'recipient@example.com', active: false })
    });
    model.findOneAndUpdate.mockReturnValueOnce({ exec: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}) });

    await controller.sendInvite(req, res);

    expect(model.findById).toHaveBeenCalledWith('recipient-id');
    expect(model.findOneAndUpdate).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(false, 'https://app', 'recipient@example.com', expect.any(String));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
