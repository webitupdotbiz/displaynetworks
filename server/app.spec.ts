import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import http from 'node:http';
import request from 'supertest';

const mockConnectToMongo = jest.fn<() => Promise<void>>();
const mockStartChannelSocketServer = jest.fn<(server: http.Server) => void>();
const mockNotifyChannelChanged = jest.fn<(channelId: string) => Promise<void>>();
const mockNotifyUserStatusChanged = jest.fn<(userId: string, status: string) => Promise<void>>();
const mockNotifyOwnerChanged = jest.fn<(channelId: string, ownerId: string) => Promise<void>>();

jest.unstable_mockModule('./mongo.js', () => ({
  __esModule: true,
  connectToMongo: mockConnectToMongo,
}));

jest.unstable_mockModule('./services/channel.socket.js', () => ({
  __esModule: true,
  startChannelSocketServer: mockStartChannelSocketServer,
  notifyChannelChanged: mockNotifyChannelChanged,
  notifyUserStatusChanged: mockNotifyUserStatusChanged,
  notifyOwnerChanged: mockNotifyOwnerChanged,
}));

const { default: app, main } = await import('./app.js');

describe('server app', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      TOKEN_SECRET: 'test-access-token-secret',
      REFRESH_TOKEN_SECRET: 'test-refresh-token-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export the Express application without starting a listener', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    expect(app.get('port')).toBeTruthy();
  });

  it('applies Helmet security headers to responses', async () => {
    const response = await request(app).get('/not-found');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('main starts mongo, wires websocket server, and listens on configured port', async () => {
    mockConnectToMongo.mockResolvedValue(undefined);
    mockStartChannelSocketServer.mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const mockListen = jest.fn((_: unknown, cb?: () => void) => {
      if (cb) cb();
      return {} as http.Server;
    });

    const fakeServer = { listen: mockListen } as unknown as http.Server;
    const createServerSpy = jest.spyOn(http, 'createServer').mockReturnValue(fakeServer);

    await main();

    expect(mockConnectToMongo).toHaveBeenCalledTimes(1);
    expect(createServerSpy).toHaveBeenCalledWith(expect.any(Function));
    expect(createServerSpy.mock.calls[0][0]).toBe(app);
    expect(mockStartChannelSocketServer).toHaveBeenCalledWith(fakeServer);
    expect(mockListen).toHaveBeenCalledWith(app.get('port'), expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Display Networks listening on port'));
  });

  it('main logs errors when mongo connection fails', async () => {
    const error = new Error('mongo failed');
    mockConnectToMongo.mockRejectedValue(error);
    const createServerSpy = jest.spyOn(http, 'createServer');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await main();

    expect(mockConnectToMongo).toHaveBeenCalledTimes(1);
    expect(createServerSpy).not.toHaveBeenCalled();
    expect(mockStartChannelSocketServer).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(error);
  });
});
