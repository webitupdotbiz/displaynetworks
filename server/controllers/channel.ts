import { Request, Response } from 'express';
import Channel, { IChannel } from '../models/channel.js';
import BaseCtrl from './base.js';
import Rule, { IRule } from '../models/rule.js';
import { RuleEngine } from '../services/rule.engine.js';
import { channelCache, rulesCache } from '../services/store.cache.js';
import { notifyChannelChanged } from '../services/channel.socket.js';
import {
  copyAllowedFields,
  createSearchRegex,
  requireBodyObject,
  validateOptionalString,
  validateOptionalStringArray
} from '../middleware/validate-body.js';

export default class ChannelCtrl extends BaseCtrl<IChannel> {
  model = Channel;
  ruleModel = Rule;

  private getOwnerScope(req: Request): string | undefined {
    if (req.user?.role === 'admin') return undefined;
    if (req.user?.role === 'groupadmin') return req.user.id;
    return req.user?.role;
  }

  private sanitizeChannel(channel: IChannel): Omit<IChannel, 'owner'> & { owner: string } {
    const { owner, ...publicChannel } = channel;
    return { ...publicChannel, owner: '' };
  }

  private normalizeValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;

    const youtubeShortMatch = value.match(/^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]+)(?:\?.*)?$/);
    if (youtubeShortMatch) {
      return `https://youtube.com/embed/${youtubeShortMatch[1]}?autoplay=1`;
    }

    return value;
  }

  private sanitizePayload(body: unknown): Record<string, unknown> {
    const input = requireBodyObject(body);
    for (const field of ['name', 'displayName', 'value', 'search', 'notes']) {
      validateOptionalString(input, field);
    }
    validateOptionalStringArray(input, 'tags');
    return copyAllowedFields(input, ['name', 'displayName', 'value', 'search', 'tags', 'notes']);
  }

  private setChannelHeaders(res: Response): void {
    res.header(
      'Cache-Control',
      'private, no-cache, no-store, must-revalidate'
    );
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
  }

  override getAll = async (req: Request, res: Response) => {
    try {
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.header('Expires', '-1');
      res.header('Pragma', 'no-cache');
      let params = <any>{};
      let result = <any>{};
      const searchRegex = createSearchRegex(req.query.term);
      if (searchRegex) params.search = searchRegex;
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (ownerScope) params.owner = ownerScope;
      else if (req.params.id) params.owner = req.params.id;
      const count = await this.model.countDocuments(params);
      result.count = count;
      //if (req.params.last) params.updatedAt = {'$lt': new Date(req.params.last)};
      if (req.params.last) {
        params._id = { $lt: req.params.last };
      }
      const docs = await this.model.find(params).limit(15).sort({updatedAt: -1});
      result.channels = docs;
      return res.status(200).json(result);
    } catch (err) {
        const error = err instanceof Error ? err.message : "An unknown error occurred";
        return res.status(400).json({ error });
      }
  };

  override get = async (req: Request, res: Response) => {
    try {
      const ownerScope = this.getOwnerScope(req);
      const params = ownerScope ? { _id: req.params.id, owner: ownerScope } : { _id: req.params.id };
      const channel = await this.model.findOne(params);
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      return res.status(200).json(channel);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(500).json({ error });
    }
  };

  override insert = async (req: Request, res: Response) => {
    try {
      const payload = this.sanitizePayload(req.body);
      payload.value = this.normalizeValue(payload.value);
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope) payload.owner = ownerScope;
      const obj = await new this.model(payload).save();
      if (obj?.name) {
        await notifyChannelChanged(obj.name);
      }
      return res.status(201).json(obj);
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  override update = async (req: Request, res: Response) => {
    try {
      const payload = this.sanitizePayload(req.body);
      payload.value = this.normalizeValue(payload.value);
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope) payload.owner = ownerScope;
      const params = ownerScope ? { _id: req.params.id, owner: ownerScope } : { _id: req.params.id };
      const updated = await this.model.findOneAndUpdate(params, payload);
      if (!updated) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      const channelName = req.body?.name;
      if (channelName) {
        channelCache.invalidate(channelName);
        await notifyChannelChanged(channelName);
      }
      return res.status(200).json({ message: "OK" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  // Count all
  override count = async (req: Request, res: Response) => {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    try {
      let params = {};
      if (req.params.id) params = { owner: req.params.id }
      const count = await this.model.countDocuments(params);
      return res.status(200).json(count);
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  override delete = async (req: Request, res: Response) => {
    try {
      const channelId: string = req.params.id;
      const ownerScope = this.getOwnerScope(req);
      const byIdParams = ownerScope ? { _id: channelId, owner: ownerScope } : { _id: channelId };
      const byNameParams = ownerScope ? { name: channelId.toLowerCase(), owner: ownerScope } : { name: channelId.toLowerCase() };
      const deletedById = await this.model.findOneAndDelete(byIdParams);
      const deletedChannel = deletedById || await this.model.findOneAndDelete(byNameParams);
      if (!deletedChannel) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      if (deletedChannel?.name) {
        channelCache.invalidate(deletedChannel.name);
        await notifyChannelChanged(deletedChannel.name);
      }
      return res.status(200).json({ message: "OK" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };


  getByName = async (req: Request, res: Response) => {
    try {
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.header('Expires', '-1');
      res.header('Pragma', 'no-cache');
      const obj = await this.model.findOne({ name: req.params.name.toLowerCase() });
      if (obj) {
        const payload = obj.toObject ? obj.toObject() : obj;
        const channel = this.sanitizeChannel(payload);
        return res.status(200).json(channel);
      }
      return res.status(404).json({
        error: 'Channel not found'
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(500).json({ error });
    }
  };
  fetchChannelByName = async (name: string): Promise<IChannel | null> => {
    const channelDoc = await this.model.findOne({ name });
    return channelDoc ? channelDoc.toObject() : null;
  }

 fetchActiveRulesForOwner = async (ownerId: string): Promise<IRule[]> => {
    return this.ruleModel.find({ owner: ownerId, isActive: true })
      .sort({ priority: 1 })
      .lean();
  }

  evaluateAndApplyRules = (channel: IChannel, rules: IRule[]): Omit<IChannel, 'owner'> => {
    const workingChannel = { ...channel };
    const matchingRule = RuleEngine.findFirstMatch(workingChannel, rules);

    if (matchingRule) {
      workingChannel.value = matchingRule.overrideUrl;
      workingChannel.matchedRuleName = matchingRule.name;
    }

    const appliedChannel = this.sanitizeChannel(workingChannel);
    return appliedChannel;
  }

  public getByNameApplyRules = async (req: Request, res: Response): Promise<Response> => {
    try {
      this.setChannelHeaders(res);

      const channelName = (req.params.name || '').trim().toLowerCase();
      if (!channelName) {
        throw 'channel not found';
      }
      let channel = channelCache.get(channelName);
      if (!channel) {
        channel = await this.fetchChannelByName(channelName) ?? undefined;
        if (channel) channelCache.set(channelName, channel);
      }
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      let activeRules = rulesCache.get(channel.owner);
      if (!activeRules) {
        activeRules = await this.fetchActiveRulesForOwner(channel.owner) ?? undefined;
        if (activeRules) rulesCache.set(channel.owner, activeRules);
      }    
      const updatedChannel = this.evaluateAndApplyRules(channel, activeRules);
      return res.status(200).json(updatedChannel);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(500).json({ error });
    }
  };

checkNameAvailable = async (req: Request, res: Response) => {
  try {
    const obj = await this.model.findOne({ name: req.params.name.toLowerCase() });
    return res.status(200).json({ exists: !!obj });
  } catch (err) {
    const error = err instanceof Error ? err.message : "An unknown error occurred";
    return res.status(400).json({ error });
  }
};

}
