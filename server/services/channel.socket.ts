import http, { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../middleware/utils/jwt.js';

import Channel, { IChannel } from '../models/channel.js';
import Rule, { IRule } from '../models/rule.js';
import { RuleEngine } from './rule.engine.js';
import { channelCache, rulesCache } from './store.cache.js';

const WS_PATH_PREFIX = '/_ws/channel/';
const WS_USERS_PATH = '/_ws/users';
const REEVALUATE_INTERVAL_MS = 15000;
const CATCH_UP_FALLBACK_DELAY_MS = 100;

const HANDSHAKE_TYPE = 'display-handshake';

type EffectiveChannel = Omit<IChannel, 'owner'> & { owner: string };

type ChannelUpdatePayload = {
  type: 'channel-update';
  channel: string;
  value: string;
  matchedRuleName: string;
  version: number;
  sentAt: string;
};

type UserStatusUpdatePayload = {
  type: 'user-status';
  userId: string;
  active: boolean;
  sentAt: string;
};

type DisplayHandshakePayload = {
  type: typeof HANDSHAKE_TYPE;
  timezone?: string;
};

type ResolvedChannel = {
  publicChannel: EffectiveChannel;
  ownerId: string;
};

type SocketChannelState = {
  value: string;
  matchedRuleName: string;
  version: number;
};

type UpgradeTarget =
  | { type: 'channel'; channelName: string }
  | { type: 'users' };

type SocketKind = 'channel' | 'users';

export class ChannelSocketHub {
  private wss: WebSocketServer | null = null;
  private reevaluateTimer: NodeJS.Timeout | null = null;

  private readonly channelSubscribers = new Map<string, Set<WebSocket>>();
  private readonly userSubscribers = new Set<WebSocket>();
  private readonly socketChannel = new Map<WebSocket, string>();
  private readonly socketKind = new Map<WebSocket, SocketKind>();
  private readonly socketTimezones = new Map<WebSocket, string>();
  private readonly socketState = new Map<WebSocket, SocketChannelState>();
  private readonly socketInitialized = new Set<WebSocket>();
  private readonly socketCatchupTimers = new Map<WebSocket, NodeJS.Timeout>();
  private readonly channelOwners = new Map<string, string>();

  public start(server: http.Server): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      try {
        const target = this.extractUpgradeTarget(req);
        if (!target) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        this.wss?.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          this.wss?.emit('connection', ws, req, target);
        });
      } catch (err) {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage, target: UpgradeTarget) => {
      if (target.type === 'channel') {
        this.addChannelSubscription(target.channelName, ws);
        ws.on('message', (raw: unknown) => {
          this.handleSocketMessage(ws, target.channelName, raw);
        });

        this.scheduleCatchUp(ws, target.channelName);
      } else {
        this.addUsersSubscription(ws);
      }

      ws.on('close', () => {
        this.removeSubscription(ws);
      });

      ws.on('error', () => {
        this.removeSubscription(ws);
      });
    });

    this.reevaluateTimer = setInterval(() => {
      void this.reevaluateSubscribedChannels();
    }, REEVALUATE_INTERVAL_MS);

    this.reevaluateTimer.unref?.();
  }

  public async notifyChannelChanged(channelName: string): Promise<void> {
    const normalizedName = this.normalizeChannelName(channelName);
    if (!normalizedName || !this.channelSubscribers.has(normalizedName)) return;
    await this.publishIfChanged(normalizedName);
  }

  public async notifyOwnerChanged(ownerId: string): Promise<void> {
    if (!ownerId) return;
    if (this.channelSubscribers.size === 0) return;

    const candidateChannels = new Set<string>();

    for (const [channelName, mappedOwner] of this.channelOwners.entries()) {
      if (mappedOwner === ownerId) {
        candidateChannels.add(channelName);
      }
    }

    if (candidateChannels.size === 0) {
      const channels = await Channel.find({ owner: ownerId }, { name: 1, _id: 0 }).lean();
      channels.forEach((channel) => {
        if (channel?.name) candidateChannels.add(this.normalizeChannelName(channel.name));
      });
    }

    for (const channelName of candidateChannels.values()) {
      if (!this.channelSubscribers.has(channelName)) continue;
      await this.publishIfChanged(channelName);
    }
  }

  public notifyUserStatusChanged(userId: string, active: boolean): void {
    if (!userId || this.userSubscribers.size === 0) return;

    const payload: UserStatusUpdatePayload = {
      type: 'user-status',
      userId,
      active,
      sentAt: new Date().toISOString()
    };

    const serialized = JSON.stringify(payload);
    for (const ws of this.userSubscribers.values()) {
      this.safeSend(ws, serialized);
    }
  }

  private extractUpgradeTarget(req: IncomingMessage): UpgradeTarget | null {
    const rawUrl = req.url ?? '';
    let pathname = '';
    let searchParams = new URLSearchParams();

    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      pathname = parsed.pathname;
      searchParams = parsed.searchParams;
    } catch {
      return null;
    }

    if (pathname === WS_USERS_PATH || pathname === `${WS_USERS_PATH}/`) {
      const token = searchParams.get('token') ?? '';
      if (!this.canSubscribeUsers(token)) {
        return null;
      }
      return { type: 'users' };
    }

    if (!pathname.startsWith(WS_PATH_PREFIX)) {
      return null;
    }

    const rawChannelName = pathname.slice(WS_PATH_PREFIX.length);
    if (!rawChannelName) {
      return null;
    }

    return { type: 'channel', channelName: this.normalizeChannelName(decodeURIComponent(rawChannelName)) };
  }

  private canSubscribeUsers(token: string): boolean {
    const envSecretToken = getJwtSecret('TOKEN_SECRET');
    if (!token) return false;

    try {
      const decoded = jwt.verify(token, envSecretToken) as { user?: { role?: string } };
      const role = decoded?.user?.role;
      return role === 'admin' || role === 'groupadmin';
    } catch {
      return false;
    }
  }

  private normalizeChannelName(value: string): string {
    return (value || '').trim().toLowerCase();
  }

  private addChannelSubscription(channelName: string, ws: WebSocket): void {
    let subscribers = this.channelSubscribers.get(channelName);
    if (!subscribers) {
      subscribers = new Set<WebSocket>();
      this.channelSubscribers.set(channelName, subscribers);
    }

    subscribers.add(ws);
    this.socketKind.set(ws, 'channel');
    this.socketChannel.set(ws, channelName);
  }

  private addUsersSubscription(ws: WebSocket): void {
    this.userSubscribers.add(ws);
    this.socketKind.set(ws, 'users');
  }

  private removeSubscription(ws: WebSocket): void {
    const kind = this.socketKind.get(ws);
    if (kind === 'users') {
      this.userSubscribers.delete(ws);
      this.socketKind.delete(ws);
      return;
    }

    const channelName = this.socketChannel.get(ws);
    if (!channelName) {
      this.socketKind.delete(ws);
      return;
    }

    const subscribers = this.channelSubscribers.get(channelName);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channelName);
        this.channelOwners.delete(channelName);
      }
    }

    this.clearSocketCatchupTimer(ws);
    this.socketKind.delete(ws);
    this.socketTimezones.delete(ws);
    this.socketState.delete(ws);
    this.socketInitialized.delete(ws);
    this.socketChannel.delete(ws);
  }

  private scheduleCatchUp(ws: WebSocket, channelName: string): void {
    this.clearSocketCatchupTimer(ws);
    const timer = setTimeout(() => {
      this.socketCatchupTimers.delete(ws);
      if (this.socketInitialized.has(ws) || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      void this.sendCatchUp(ws, channelName);
    }, CATCH_UP_FALLBACK_DELAY_MS);
    this.socketCatchupTimers.set(ws, timer);
  }

  private clearSocketCatchupTimer(ws: WebSocket): void {
    const timer = this.socketCatchupTimers.get(ws);
    if (!timer) return;
    clearTimeout(timer);
    this.socketCatchupTimers.delete(ws);
  }

  private handleSocketMessage(ws: WebSocket, channelName: string, raw: unknown): void {
    const text = this.toUtf8String(raw);
    if (!text) return;

    try {
      const payload = JSON.parse(text) as DisplayHandshakePayload;
      if (payload?.type !== HANDSHAKE_TYPE) {
        return;
      }

      const timezone = this.isValidIanaTimezone(payload.timezone) ? payload.timezone! : 'UTC';
      this.socketTimezones.set(ws, timezone);

      if (!this.socketInitialized.has(ws)) {
        this.clearSocketCatchupTimer(ws);
        void this.sendCatchUp(ws, channelName);
      }
    } catch {
      // Ignore malformed client messages
    }
  }

  private toUtf8String(raw: unknown): string {
    if (typeof raw === 'string') {
      return raw;
    }

    if (raw instanceof Buffer) {
      return raw.toString('utf8');
    }

    if (raw instanceof ArrayBuffer) {
      return Buffer.from(raw).toString('utf8');
    }

    if (Array.isArray(raw)) {
      const chunks = raw.map((entry) => {
        if (typeof entry === 'string') return Buffer.from(entry, 'utf8');
        if (entry instanceof Buffer) return entry;
        if (entry instanceof ArrayBuffer) return Buffer.from(entry);
        return Buffer.from([]);
      });
      return Buffer.concat(chunks).toString('utf8');
    }

    return '';
  }

  private isValidIanaTimezone(tz: string | undefined): boolean {
    if (!tz || typeof tz !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  private async sendCatchUp(ws: WebSocket, channelName: string): Promise<void> {
    const wasSent = await this.publishIfChanged(channelName, { forceSend: true, target: ws });
    this.socketInitialized.add(ws);
    if (!wasSent && ws.readyState === WebSocket.OPEN) {
      ws.close(1008, 'Channel not found');
    }
  }

  private async reevaluateSubscribedChannels(): Promise<void> {
    const subscribedChannels = [...this.channelSubscribers.keys()];
    for (const channelName of subscribedChannels) {
      await this.publishIfChanged(channelName);
    }
  }

  private async publishIfChanged(
    channelName: string,
    options: { forceSend?: boolean; target?: WebSocket } = {}
  ): Promise<boolean> {
    if (options.target) {
      return this.publishToSocket(channelName, options.target, !!options.forceSend);
    }

    const subscribers = this.channelSubscribers.get(channelName);
    if (!subscribers || subscribers.size === 0) {
      return false;
    }

    let sentAny = false;
    for (const ws of subscribers.values()) {
      const sent = await this.publishToSocket(channelName, ws, !!options.forceSend);
      sentAny = sentAny || sent;
    }

    return sentAny;
  }

  private async publishToSocket(channelName: string, ws: WebSocket, forceSend: boolean): Promise<boolean> {
    const displayTimezone = this.socketTimezones.get(ws) || 'UTC';
    const resolved = await this.resolveEffectiveChannel(channelName, displayTimezone);
    if (!resolved) return false;

    const { publicChannel, ownerId } = resolved;
    this.channelOwners.set(channelName, ownerId);

    const normalizedMatchedRule = publicChannel.matchedRuleName || '';
    const previous = this.socketState.get(ws);

    const hasChanged =
      !previous ||
      previous.value !== publicChannel.value ||
      previous.matchedRuleName !== normalizedMatchedRule;

    let version = previous?.version ?? 0;

    if (!previous) {
      version = 1;
    } else if (hasChanged) {
      version += 1;
    }

    if (!forceSend && !hasChanged) {
      return true;
    }

    this.socketState.set(ws, {
      value: publicChannel.value,
      matchedRuleName: normalizedMatchedRule,
      version
    });

    const payload: ChannelUpdatePayload = {
      type: 'channel-update',
      channel: channelName,
      value: publicChannel.value,
      matchedRuleName: normalizedMatchedRule,
      version,
      sentAt: new Date().toISOString()
    };

    this.safeSend(ws, JSON.stringify(payload));
    return true;
  }

  private safeSend(ws: WebSocket, data: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        this.removeSubscription(ws);
      }
    }
  }

  private async resolveEffectiveChannel(channelName: string, displayTimezone: string): Promise<ResolvedChannel | null> {
    let channel = channelCache.get(channelName);

    if (!channel) {
      const dbChannel = await Channel.findOne({ name: channelName }).lean<IChannel>();
      if (!dbChannel) return null;
      channel = dbChannel;
      channelCache.set(channelName, dbChannel);
    }

    const ownerId = channel.owner;

    let rules = rulesCache.get(ownerId);
    if (!rules) {
      const dbRules = await Rule.find({ owner: ownerId, isActive: true })
        .sort({ priority: 1 })
        .lean<IRule[]>();
      rules = dbRules;
      rulesCache.set(ownerId, dbRules);
    }

    const workingChannel: IChannel = { ...channel };
    const matchingRule = RuleEngine.findFirstMatch(workingChannel, rules || [], {
      displayTimezone
    });

    if (matchingRule) {
      workingChannel.value = matchingRule.overrideUrl;
      workingChannel.matchedRuleName = matchingRule.name;
    } else {
      workingChannel.matchedRuleName = '';
    }

    const { owner, ...publicChannel } = workingChannel;
    return {
      ownerId,
      publicChannel: { ...publicChannel, owner: '' }
    };
  }
}

const hub = new ChannelSocketHub();

export function startChannelSocketServer(server: http.Server): void {
  hub.start(server);
}

export async function notifyChannelChanged(channelName: string): Promise<void> {
  await hub.notifyChannelChanged(channelName);
}

export async function notifyOwnerChanged(ownerId: string): Promise<void> {
  await hub.notifyOwnerChanged(ownerId);
}

export function notifyUserStatusChanged(userId: string, active: boolean): void {
  hub.notifyUserStatusChanged(userId, active);
}
