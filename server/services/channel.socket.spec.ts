import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import { AddressInfo } from 'net';
import { WebSocket as WsClient, RawData } from 'ws';
import jwt from 'jsonwebtoken';

type ChannelDoc = {
  name: string;
  owner: string;
  displayName: string;
  value: string;
  search: string;
  tags: string[];
  matchedRuleName: string;
};

type RuleDoc = {
  name: string;
  owner: string;
  overrideUrl: string;
  matchStrategy: 'ANY' | 'ALL';
  tags: string[];
  priority: number;
  isActive: boolean;
  scheduleType?: 'CLIENT_CLOCK' | 'GLOBAL_INSTANT';
  timezone?: string;
  startTime?: string;
  endTime?: string;
};

type ChannelSocketMessage = {
  type: string;
  channel?: string;
  value?: string;
  version?: number;
  userId?: string;
  active?: boolean;
  sentAt?: string;
  matchedRuleName?: string;
};

type MockWebSocket = {
  readyState: number;
  send: jest.Mock<(data: string) => void>;
};

const channelFindOneMock = jest.fn<(query: { name: string }) => { lean: () => Promise<ChannelDoc | null> }>();
const channelFindMock = jest.fn<(query: { owner: string }, projection?: { name: number; _id: number }) => { lean: () => Promise<{ name: string }[]> }>();
const ruleFindMock = jest.fn<(query: { owner: string }) => { sort: (sortObj: Record<string, number>) => { lean: () => Promise<RuleDoc[]> } }>();

jest.unstable_mockModule('../models/channel.js', () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => channelFindOneMock(...(args as [query: { name: string }])),
    find: (...args: unknown[]) => channelFindMock(...(args as [query: { owner: string }, projection?: { name: number; _id: number }]))
  }
}));

jest.unstable_mockModule('../models/rule.js', () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => ruleFindMock(...(args as [query: { owner: string }]))
  }
}));

const { channelCache, rulesCache } = await import('./store.cache.js');
const {
  ChannelSocketHub,
  notifyChannelChanged,
  notifyOwnerChanged,
  notifyUserStatusChanged,
  startChannelSocketServer
} = await import('./channel.socket.js');

describe('channel.socket service', () => {
  let server: http.Server;
  let baseWsUrl: string;
  const previousTokenSecret = process.env.TOKEN_SECRET;
  const activeSockets = new Set<WsClient>();

  const channelsByName = new Map<string, ChannelDoc>();
  const rulesByOwner = new Map<string, RuleDoc[]>();

  const waitForOpen = (ws: WsClient): Promise<void> =>
    new Promise((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

  const waitForClose = (ws: WsClient): Promise<{ code: number; reason: string }> =>
    new Promise((resolve) => {
      ws.once('close', (code: number, reasonBuffer: Buffer) => {
        resolve({ code, reason: reasonBuffer.toString() });
      });
    });

  const waitForMessage = (ws: WsClient): Promise<ChannelSocketMessage> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for websocket message')), 2500);
      ws.once('message', (raw: Buffer | string) => {
        clearTimeout(timer);
        resolve(JSON.parse(raw.toString()) as ChannelSocketMessage);
      });
      ws.once('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

  const expectNoMessage = async (ws: WsClient, waitMs = 250): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const onMessage = () => {
        cleanup();
        reject(new Error('Unexpected websocket message received'));
      };

      const onTimeout = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        ws.off('message', onMessage);
        clearTimeout(timer);
      };

      const timer = setTimeout(onTimeout, waitMs);
      ws.on('message', onMessage);
    });
  };

  const getClockParts = (date: Date, timezone: string): { hour: number; minute: number } => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return { hour, minute };
  };

  const toHHMM = (hour: number, minute: number): string => {
    const h = String((hour + 24) % 24).padStart(2, '0');
    const m = String((minute + 60) % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  beforeAll(async () => {
    process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-token-secret';

    channelFindOneMock.mockImplementation((query) => ({
      lean: jest.fn<() => Promise<ChannelDoc | null>>().mockResolvedValue(channelsByName.get(query.name) ?? null)
    }));

    channelFindMock.mockImplementation((query) => ({
      lean: jest.fn<() => Promise<{ name: string }[]>>().mockResolvedValue(
        [...channelsByName.values()]
          .filter((channel) => channel.owner === query.owner)
          .map((channel) => ({ name: channel.name }))
      )
    }));

    ruleFindMock.mockImplementation((query) => ({
      sort: jest.fn<(sortObj: Record<string, number>) => { lean: () => Promise<RuleDoc[]> }>().mockReturnValue({
        lean: jest.fn<() => Promise<RuleDoc[]>>().mockResolvedValue(rulesByOwner.get(query.owner) ?? [])
      })
    }));

    server = http.createServer();
    startChannelSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseWsUrl = `ws://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    channelFindOneMock.mockClear();
    channelFindMock.mockClear();
    ruleFindMock.mockClear();
    channelsByName.clear();
    rulesByOwner.clear();
    channelCache.clearAll();
    rulesCache.clearAll();
  });

  afterEach(async () => {
    const sockets = [...activeSockets.values()];
    activeSockets.clear();

    await Promise.all(
      sockets.map(async (socket) => {
        if (socket.readyState === WsClient.OPEN || socket.readyState === WsClient.CONNECTING) {
          socket.close();
          try {
            await waitForClose(socket);
          } catch {
            socket.terminate();
          }
        }
      })
    );
  });

  afterAll(async () => {
    if (previousTokenSecret === undefined) {
      delete process.env.TOKEN_SECRET;
    } else {
      process.env.TOKEN_SECRET = previousTokenSecret;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('sends catch-up payload on connect and broadcasts channel change', async () => {
    channelsByName.set('demo', {
      name: 'demo',
      owner: 'owner-1',
      displayName: 'Demo',
      value: 'https://example.com/first',
      search: 'demo',
      tags: ['news'],
      matchedRuleName: ''
    });
    rulesByOwner.set('owner-1', []);

    const ws = new WsClient(`${baseWsUrl}/_ws/channel/demo`);
    activeSockets.add(ws);
    const firstMessagePromise = waitForMessage(ws);
    await waitForOpen(ws);

    const firstPayload = await firstMessagePromise;
    expect(firstPayload.type).toBe('channel-update');
    expect(firstPayload.channel).toBe('demo');
    expect(firstPayload.value).toBe('https://example.com/first');
    expect(firstPayload.version).toBe(1);

    await expectNoMessage(ws);

    channelsByName.set('demo', {
      ...channelsByName.get('demo')!,
      value: 'https://example.com/second'
    });
    channelCache.invalidate('demo');

    await notifyChannelChanged('demo');

    const secondPayload = await waitForMessage(ws);
    expect(secondPayload.value).toBe('https://example.com/second');
    expect(secondPayload.version).toBe(2);

    ws.close();
    await waitForClose(ws);
    activeSockets.delete(ws);
  });

  it('handles message payload input in string, Buffer, ArrayBuffer, and Array formats', () => {
    const hub = new ChannelSocketHub() as unknown as { toUtf8String: (data: unknown) => string };
    expect(hub.toUtf8String('hello')).toBe('hello');
    expect(hub.toUtf8String(Buffer.from('hello'))).toBe('hello');

    const ab = new ArrayBuffer(5);
    const view = new Uint8Array(ab);
    view.set([104, 101, 108, 108, 111]);
    expect(hub.toUtf8String(ab)).toBe('hello');

    expect(hub.toUtf8String(['hello', Buffer.from(' world'), ab])).toBe('hello worldhello');
    expect(hub.toUtf8String(123)).toBe('');
  });

  it('handles malformed, invalid type, and unparseable socket messages gracefully', async () => {
    channelsByName.set('message-test', {
      name: 'message-test',
      owner: 'owner-msg',
      displayName: 'Message Test',
      value: 'https://example.com/msg',
      search: 'message-test',
      tags: [],
      matchedRuleName: ''
    });

    const ws = new WsClient(`${baseWsUrl}/_ws/channel/message-test`);
    activeSockets.add(ws);
    await waitForOpen(ws);
    await waitForMessage(ws);

    ws.send('invalid json');
    ws.send(JSON.stringify({ type: 'other-type' }));
    ws.send(Buffer.from([0xff, 0xff]));

    await expectNoMessage(ws);

    ws.close();
    await waitForClose(ws);
    activeSockets.delete(ws);
  });

  it('broadcasts user status updates to users websocket subscribers', async () => {
    const token = jwt.sign(
      { user: { id: 'admin-id', role: 'admin', email: 'admin@example.com' } },
      process.env.TOKEN_SECRET || 'test-token-secret'
    );
    const ws = new WsClient(`${baseWsUrl}/_ws/users?token=${encodeURIComponent(token)}`);
    activeSockets.add(ws);
    await waitForOpen(ws);

    const payloadPromise = waitForMessage(ws);
    notifyUserStatusChanged('user-42', true);

    const payload = await payloadPromise;
    expect(payload.type).toBe('user-status');
    expect(payload.userId).toBe('user-42');
    expect(payload.active).toBe(true);
    expect(typeof payload.sentAt).toBe('string');

    ws.close();
    await waitForClose(ws);
    activeSockets.delete(ws);
  });

  it('allows groupadmin role to subscribe to users websocket', async () => {
    const token = jwt.sign(
      { user: { id: 'groupadmin-id', role: 'groupadmin' } },
      process.env.TOKEN_SECRET || 'test-token-secret'
    );
    const ws = new WsClient(`${baseWsUrl}/_ws/users?token=${encodeURIComponent(token)}`);
    activeSockets.add(ws);
    await waitForOpen(ws);

    const payloadPromise = waitForMessage(ws);
    notifyUserStatusChanged('user-99', false);

    const payload = await payloadPromise;
    expect(payload.userId).toBe('user-99');
    expect(payload.active).toBe(false);

    ws.close();
    await waitForClose(ws);
    activeSockets.delete(ws);
  });

  it('rejects users websocket with invalid user role or invalid token', async () => {
    const userToken = jwt.sign(
      { user: { id: 'user-id', role: 'user' } },
      process.env.TOKEN_SECRET || 'test-token-secret'
    );

    const ws1 = new WsClient(`${baseWsUrl}/_ws/users?token=${encodeURIComponent(userToken)}`);
    activeSockets.add(ws1);
    await expect(
      new Promise<void>((resolve, reject) => {
        ws1.once('open', () => reject(new Error('Unexpectedly opened with user role')));
        ws1.once('error', () => {
          ws1.terminate();
          resolve();
        });
      })
    ).resolves.toBeUndefined();
    activeSockets.delete(ws1);

    const ws2 = new WsClient(`${baseWsUrl}/_ws/users?token=invalid.jwt.token`);
    activeSockets.add(ws2);
    await expect(
      new Promise<void>((resolve, reject) => {
        ws2.once('open', () => reject(new Error('Unexpectedly opened with invalid token')));
        ws2.once('error', () => {
          ws2.terminate();
          resolve();
        });
      })
    ).resolves.toBeUndefined();
    activeSockets.delete(ws2);
  });

  it('rejects users websocket without auth token', async () => {
    const ws = new WsClient(`${baseWsUrl}/_ws/users`);
    activeSockets.add(ws);

    await expect(
      new Promise<void>((resolve, reject) => {
        ws.once('open', () => reject(new Error('Unexpectedly opened users websocket without auth token')));
        ws.once('error', () => {
          ws.terminate();
          resolve();
        });
      })
    ).resolves.toBeUndefined();

    activeSockets.delete(ws);
  });

  it('publishes owner-based updates when effective value changes via matching rule', async () => {
    channelsByName.set('sports', {
      name: 'sports',
      owner: 'owner-2',
      displayName: 'Sports',
      value: 'https://example.com/default',
      search: 'sports',
      tags: ['sports', 'live'],
      matchedRuleName: ''
    });

    rulesByOwner.set('owner-2', []);

    const ws = new WsClient(`${baseWsUrl}/_ws/channel/sports`);
    activeSockets.add(ws);
    const initialMessagePromise = waitForMessage(ws);
    await waitForOpen(ws);

    const initialPayload = await initialMessagePromise;
    expect(initialPayload.value).toBe('https://example.com/default');
    expect(initialPayload.version).toBe(1);

    rulesByOwner.set('owner-2', [
      {
        name: 'Live Override',
        owner: 'owner-2',
        overrideUrl: 'https://example.com/override',
        matchStrategy: 'ANY',
        tags: ['sports'],
        priority: 0,
        isActive: true
      }
    ]);
    rulesCache.invalidate('owner-2');

    await notifyOwnerChanged('owner-2');

    const updatedPayload = await waitForMessage(ws);
    expect(updatedPayload.value).toBe('https://example.com/override');
    expect(updatedPayload.matchedRuleName).toBe('Live Override');
    expect(updatedPayload.version).toBe(2);

    ws.close();
    await waitForClose(ws);
    activeSockets.delete(ws);
  });

  it('fetches candidate channels from DB when channelOwners map is empty during owner update', async () => {
    channelsByName.set('db-owner-channel', {
      name: 'db-owner-channel',
      owner: 'owner-db',
      displayName: 'DB Owner Channel',
      value: 'https://example.com/db',
      search: 'db-owner-channel',
      tags: [],
      matchedRuleName: ''
    });
    rulesByOwner.set('owner-db', []);

    const hub = new ChannelSocketHub() as unknown as {
      addChannelSubscription: (channel: string, ws: unknown) => void;
      socketTimezones: Map<unknown, string>;
      notifyOwnerChanged: (owner: string) => Promise<void>;
    };
    const wsMock: MockWebSocket = { readyState: WsClient.OPEN, send: jest.fn() };

    hub.addChannelSubscription('db-owner-channel', wsMock);
    hub.socketTimezones.set(wsMock, 'UTC');

    await hub.notifyOwnerChanged('owner-db');
    expect(channelFindMock).toHaveBeenCalledWith({ owner: 'owner-db' }, { name: 1, _id: 0 });
  });

  it('stores timezone from display handshake and normalizes invalid values', () => {
    const hub = new ChannelSocketHub() as unknown as {
      socketInitialized: Set<unknown>;
      handleSocketMessage: (ws: unknown, channel: string, data: RawData) => void;
      socketTimezones: Map<unknown, string>;
    };
    const wsMock: MockWebSocket = { readyState: WsClient.OPEN, send: jest.fn() };

    hub.socketInitialized.add(wsMock);
    hub.handleSocketMessage(wsMock, 'any', Buffer.from(JSON.stringify({
      type: 'display-handshake',
      timezone: 'America/New_York'
    })));
    expect(hub.socketTimezones.get(wsMock)).toBe('America/New_York');

    hub.handleSocketMessage(wsMock, 'any', Buffer.from(JSON.stringify({
      type: 'display-handshake',
      timezone: 'Not/AZone'
    })));
    expect(hub.socketTimezones.get(wsMock)).toBe('UTC');
  });

  it('evaluates CLIENT_CLOCK using socket timezone context', async () => {
    channelsByName.set('regional', {
      name: 'regional',
      owner: 'owner-tz',
      displayName: 'Regional',
      value: 'https://example.com/default',
      search: 'regional',
      tags: ['news'],
      matchedRuleName: ''
    });

    const now = new Date();
    const ny = getClockParts(now, 'America/New_York');
    const start = toHHMM(ny.hour, ny.minute);
    const end = toHHMM(ny.hour, ny.minute);

    rulesByOwner.set('owner-tz', [
      {
        name: 'NY Local Window',
        owner: 'owner-tz',
        overrideUrl: 'https://example.com/ny-override',
        matchStrategy: 'ANY',
        tags: ['news'],
        priority: 0,
        isActive: true,
        scheduleType: 'CLIENT_CLOCK',
        startTime: start,
        endTime: end
      }
    ]);

    const hub = new ChannelSocketHub() as unknown as {
      socketTimezones: Map<unknown, string>;
      publishToSocket: (channel: string, ws: unknown, force?: boolean) => Promise<boolean>;
    };
    const wsNy: MockWebSocket = { readyState: WsClient.OPEN, send: jest.fn() };
    const wsUtc: MockWebSocket = { readyState: WsClient.OPEN, send: jest.fn() };

    hub.socketTimezones.set(wsNy, 'America/New_York');
    hub.socketTimezones.set(wsUtc, 'UTC');

    await hub.publishToSocket('regional', wsNy, true);
    await hub.publishToSocket('regional', wsUtc, true);

    const nyPayload = JSON.parse(wsNy.send.mock.calls[0][0]) as ChannelSocketMessage;
    const utcPayload = JSON.parse(wsUtc.send.mock.calls[0][0]) as ChannelSocketMessage;

    expect(nyPayload.value).toBe('https://example.com/ny-override');
    expect(utcPayload.value).toBe('https://example.com/default');
  });

  it('closes channel websocket when channel does not exist', async () => {
    const ws = new WsClient(`${baseWsUrl}/_ws/channel/unknown`);
    activeSockets.add(ws);
    await waitForOpen(ws);

    const closeEvent = await waitForClose(ws);
    expect(closeEvent.code).toBe(1008);
    expect(closeEvent.reason).toBe('Channel not found');
    activeSockets.delete(ws);
  });

  it('rejects websocket upgrade for invalid path or missing channel name', async () => {
    const ws1 = new WsClient(`${baseWsUrl}/_ws/not-a-channel/demo`);
    activeSockets.add(ws1);

    await expect(
      new Promise<void>((resolve, reject) => {
        ws1.once('open', () => reject(new Error('Unexpectedly opened websocket for invalid path')));
        ws1.once('error', () => {
          ws1.terminate();
          resolve();
        });
      })
    ).resolves.toBeUndefined();
    activeSockets.delete(ws1);

    const ws2 = new WsClient(`${baseWsUrl}/_ws/channel/`);
    activeSockets.add(ws2);

    await expect(
      new Promise<void>((resolve, reject) => {
        ws2.once('open', () => reject(new Error('Unexpectedly opened websocket for empty channel name')));
        ws2.once('error', () => {
          ws2.terminate();
          resolve();
        });
      })
    ).resolves.toBeUndefined();
    activeSockets.delete(ws2);
  });

  it('returns early for owner updates when there are no subscribers', async () => {
    channelsByName.set('orphan', {
      name: 'orphan',
      owner: 'owner-3',
      displayName: 'Orphan',
      value: 'https://example.com/orphan',
      search: 'orphan',
      tags: [],
      matchedRuleName: ''
    });

    await notifyOwnerChanged('owner-3');

    expect(channelFindMock).not.toHaveBeenCalled();
    expect(channelFindOneMock).not.toHaveBeenCalled();
  });

  it('returns early for notifyChannelChanged and notifyUserStatusChanged with invalid or unsubscribed inputs', async () => {
    await notifyChannelChanged('');
    await notifyChannelChanged('unsubscribed-channel');
    notifyUserStatusChanged('', true);

    expect(channelFindOneMock).not.toHaveBeenCalled();
  });

  it('skips broadcast when effective value is unchanged', async () => {
    channelsByName.set('stable', {
      name: 'stable',
      owner: 'owner-4',
      displayName: 'Stable',
      value: 'https://example.com/stable',
      search: 'stable',
      tags: [],
      matchedRuleName: ''
    });
    rulesByOwner.set('owner-4', []);

    const hub = new ChannelSocketHub() as unknown as {
      socketTimezones: Map<unknown, string>;
      publishToSocket: (channel: string, ws: unknown, force?: boolean) => Promise<boolean>;
    };
    const wsMock: MockWebSocket = {
      readyState: WsClient.OPEN,
      send: jest.fn()
    };

    hub.socketTimezones.set(wsMock, 'UTC');

    await hub.publishToSocket('stable', wsMock, false);
    expect(wsMock.send).toHaveBeenCalledTimes(1);

    wsMock.send.mockClear();
    const result = await hub.publishToSocket('stable', wsMock, false);

    expect(result).toBe(true);
    expect(wsMock.send).not.toHaveBeenCalled();
  });

  it('handles safeSend socket send errors by removing subscription', () => {
    const hub = new ChannelSocketHub() as unknown as {
      removeSubscription: (ws: unknown) => void;
      safeSend: (ws: unknown, payload: string) => void;
    };
    const wsMock: MockWebSocket = {
      readyState: WsClient.OPEN,
      send: jest.fn().mockImplementation(() => {
        throw new Error('Send failed');
      })
    };

    const removeSpy = jest.spyOn(hub, 'removeSubscription');
    hub.safeSend(wsMock, 'test payload');

    expect(removeSpy).toHaveBeenCalledWith(wsMock);
  });

  it('removes channel subscription and cleans up maps on socket close/error', async () => {
    channelsByName.set('cleanup-test', {
      name: 'cleanup-test',
      owner: 'owner-clean',
      displayName: 'Cleanup Test',
      value: 'https://example.com/clean',
      search: 'cleanup-test',
      tags: [],
      matchedRuleName: ''
    });

    const ws = new WsClient(`${baseWsUrl}/_ws/channel/cleanup-test`);
    activeSockets.add(ws);
    await waitForOpen(ws);
    await waitForMessage(ws);

    ws.close();
    await waitForClose(ws);
    activeSockets.delete(ws);

    await notifyChannelChanged('cleanup-test');
    expect(channelFindOneMock).toHaveBeenCalledTimes(1);
  });

  it('reevaluates all subscribed channels on scheduler tick', async () => {
    const hub = new ChannelSocketHub() as unknown as {
      channelSubscribers: Map<string, Set<unknown>>;
      publishIfChanged: (channel: string) => Promise<boolean>;
      reevaluateSubscribedChannels: () => Promise<void>;
    };
    hub.channelSubscribers.set('alpha', new Set());
    hub.channelSubscribers.set('beta', new Set());

    const publishSpy = jest.spyOn(hub, 'publishIfChanged').mockResolvedValue(true);

    await hub.reevaluateSubscribedChannels();

    expect(publishSpy).toHaveBeenCalledTimes(2);
    expect(publishSpy).toHaveBeenCalledWith('alpha');
    expect(publishSpy).toHaveBeenCalledWith('beta');
  });

  it('applies matching rule override when resolving effective channel', async () => {
    channelsByName.set('music', {
      name: 'music',
      owner: 'owner-5',
      displayName: 'Music',
      value: 'https://example.com/base',
      search: 'music',
      tags: ['rock'],
      matchedRuleName: ''
    });

    rulesByOwner.set('owner-5', [
      {
        name: 'Rock Override',
        owner: 'owner-5',
        overrideUrl: 'https://example.com/rock',
        matchStrategy: 'ANY',
        tags: ['rock'],
        priority: 0,
        isActive: true
      }
    ]);

    const hub = new ChannelSocketHub() as unknown as {
      resolveEffectiveChannel: (channel: string, tz: string) => Promise<{ publicChannel: { value: string; matchedRuleName: string } }>;
    };
    const resolved = await hub.resolveEffectiveChannel('music', 'UTC');

    expect(resolved.publicChannel.value).toBe('https://example.com/rock');
    expect(resolved.publicChannel.matchedRuleName).toBe('Rock Override');
  });
});
