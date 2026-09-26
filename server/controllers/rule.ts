import type { Request, Response } from 'express';
import BaseCtrl from './base.js';
import Rule, { type IRuleDoc, type RuleScheduleType } from '../models/rule.js';
import Channel from '../models/channel.js';  
import { rulesCache } from '../services/store.cache.js';     
import { notifyOwnerChanged } from '../services/channel.socket.js';
import {
  copyAllowedFields,
  createSearchRegex,
  requireBodyObject,
  validateOptionalBoolean,
  validateOptionalNullableString,
  validateOptionalString,
  validateOptionalStringArray
} from '../middleware/validate-body.js';

export default class RuleCtrl extends BaseCtrl<IRuleDoc> {
  model = Rule;

  private getOwnerScope(req: Request): string | undefined {
    if (req.user?.role === 'admin') return undefined;
    if (req.user?.role === 'groupadmin') return req.user.id;
    return req.user?.role;
  }

  private hasOwnerAccess(req: Request, owner: string | undefined): boolean {
    const ownerScope = this.getOwnerScope(req);
    return ownerScope === undefined || ownerScope === owner;
  }

  private normalizeScheduleType(value: unknown): RuleScheduleType {
    if (value === undefined || value === null || value === '') {
      return 'CLIENT_CLOCK';
    }

    if (value === 'CLIENT_CLOCK' || value === 'GLOBAL_INSTANT') {
      return value;
    }

    throw new Error('Invalid scheduleType. Must be CLIENT_CLOCK or GLOBAL_INSTANT.');
  }

  private normalizeTimezone(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return 'UTC';
    }

    if (typeof value !== 'string') {
      throw new Error('Invalid timezone. Must be an IANA timezone string.');
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return value;
    } catch {
      throw new Error('Invalid timezone. Must be a valid IANA timezone string.');
    }
  }

  private sanitizePayload(body: unknown): Record<string, unknown> {
    const input = requireBodyObject(body);
    for (const field of [
      'name', 'overrideUrl', 'matchStrategy', 'search', 'scheduleType', 'timezone', 'owner', 'notes'
    ]) {
      validateOptionalString(input, field);
    }
    for (const field of ['startTime', 'endTime', 'startDate', 'endDate']) {
      validateOptionalNullableString(input, field);
    }
    validateOptionalBoolean(input, 'isActive');
    validateOptionalStringArray(input, 'tags');
    if (input.daysOfWeek !== undefined &&
        (!Array.isArray(input.daysOfWeek) || input.daysOfWeek.some((value) => typeof value !== 'number'))) {
      throw new Error('daysOfWeek must be an array of numbers');
    }
    return copyAllowedFields(input, [
      'name', 'overrideUrl', 'matchStrategy', 'tags', 'search', 'startTime', 'endTime',
      'startDate', 'endDate', 'daysOfWeek', 'scheduleType', 'timezone', 'owner', 'notes', 'isActive'
    ]);
  }

  getOrderedRules = async (req: Request, res: Response): Promise<Response> => {
    try {
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.header('Expires', '-1');
      res.header('Pragma', 'no-cache');

      const params: Record<string, unknown> = {};
      const result: { count?: number; rules?: IRuleDoc[] } = {};
      
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (ownerScope) params.owner = ownerScope;
      else if (req.params.id) params.owner = req.params.id;

      const searchRegex = createSearchRegex(req.query.term as string | undefined);
      if (searchRegex) params.search = searchRegex;

      const count = await this.model.countDocuments(params);
      result.count = count;

      if (req.params.last) {
        const lastPriority = Number(req.params.last);
        if (!Number.isNaN(lastPriority)) {
          params.priority = { $gt: lastPriority }; 
        }
      }

      const docs = await this.model.find(params)
        .limit(15)
        .sort({ priority: 1 }); 

      result.rules = docs;
      return res.status(200).json(result);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

  override get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const rule = await this.model.findOne({ _id: req.params.ruleId, owner: ownerScope ?? req.params.id });
      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }
      return res.status(200).json(rule);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(500).json({ error });
    }
  };

  override count = async (req: Request, res: Response): Promise<Response> => {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    try {
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      let params: Record<string, unknown> = {};
      if (ownerScope) params = { owner: ownerScope };
      else if (req.params.id) params = { owner: req.params.id };
      
      const count = await this.model.countDocuments(params);
      return res.status(200).json(count);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

  override insert = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ruleData = this.sanitizePayload(req.body);
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (ownerScope) ruleData.owner = ownerScope;
      if (ruleData.isActive === undefined) {
        ruleData.isActive = true;
      }
      ruleData.scheduleType = this.normalizeScheduleType(ruleData.scheduleType);
      ruleData.timezone = this.normalizeTimezone(ruleData.timezone);

      if (Array.isArray(ruleData.tags)) {
        ruleData.tags = ruleData.tags.map((tag: string) => tag.trim().toLowerCase());
      }

      const owner = typeof ruleData.owner === 'string' ? ruleData.owner : undefined;
      const firstPriorityRule = await this.model.findOne({ owner })
        .sort({ priority: 1 })
        .exec();
      
      ruleData.priority = firstPriorityRule ? firstPriorityRule.priority - 1 : 0;

      const obj = await new this.model(ruleData).save();
      rulesCache.invalidate(obj.owner);
      await notifyOwnerChanged(obj.owner);
      return res.status(201).json(obj);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

  override update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ruleId = typeof req.params.ruleId === 'string' ? req.params.ruleId : req.params.id;
      const updatePayload = this.sanitizePayload(req.body);
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (ownerScope) updatePayload.owner = ownerScope;

      if (Array.isArray(updatePayload.tags)) {
        updatePayload.tags = updatePayload.tags.map((tag: string) => tag.trim().toLowerCase());
      }

      if (updatePayload.startDate === '') updatePayload.startDate = null;
      if (updatePayload.endDate === '') updatePayload.endDate = null;
      if (updatePayload.startTime === '') updatePayload.startTime = null;
      if (updatePayload.endTime === '') updatePayload.endTime = null;

      if (Object.prototype.hasOwnProperty.call(updatePayload, 'scheduleType')) {
        updatePayload.scheduleType = this.normalizeScheduleType(updatePayload.scheduleType);
      }

      if (Object.prototype.hasOwnProperty.call(updatePayload, 'timezone')) {
        updatePayload.timezone = this.normalizeTimezone(updatePayload.timezone);
      }

      const existingRule = ownerScope
        ? await this.model.findOne({ _id: ruleId, owner: ownerScope })
        : await this.model.findById(ruleId);
      if (!existingRule) {
        return res.status(404).json({ error: 'Rule not found.' });
      }

      await this.model.findOneAndUpdate(ownerScope ? { _id: ruleId, owner: ownerScope } : { _id: ruleId }, updatePayload);
      const ownerId = typeof updatePayload.owner === 'string' ? updatePayload.owner : existingRule.owner;
      rulesCache.invalidate(ownerId);
      await notifyOwnerChanged(ownerId);
      return res.status(200).json({ message: 'OK' });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

  override delete = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ruleId = typeof req.params.ruleId === 'string' ? req.params.ruleId : req.params.id;
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const ruleToDelete = ownerScope
        ? await this.model.findOne({ _id: ruleId, owner: ownerScope })
        : await this.model.findById(ruleId);
      
      if (!ruleToDelete) {
        return res.status(404).json({ error: 'Rule not found.' });
      }

      await this.model.findOneAndDelete(ownerScope ? { _id: ruleId, owner: ownerScope } : { _id: ruleId });
      rulesCache.invalidate(ruleToDelete.owner);
      await notifyOwnerChanged(ruleToDelete.owner);
      
      return res.status(200).json({ message: 'OK' });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

  swapPriority = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = requireBodyObject(req.body);
      const { ruleIdA, ruleIdB, ownerId } = body;

      if (typeof ruleIdA !== 'string' || typeof ruleIdB !== 'string' || typeof ownerId !== 'string' ||
          !ruleIdA || !ruleIdB || !ownerId) {
        return res.status(400).json({ error: 'Missing swap transaction variables.' });
      }
      if (!this.hasOwnerAccess(req, ownerId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const [ruleA, ruleB] = await Promise.all([
        this.model.findOne({ _id: ruleIdA, owner: ownerId }),
        this.model.findOne({ _id: ruleIdB, owner: ownerId })
      ]);

      if (!ruleA || !ruleB) {
        return res.status(404).json({ error: 'Rules not found or scope mismatched.' });
      }

      const tempPriority = ruleA.priority;
      ruleA.priority = ruleB.priority;
      ruleB.priority = tempPriority;

      await Promise.all([ruleA.save(), ruleB.save()]);
      rulesCache.invalidate(ruleA.owner);
      await notifyOwnerChanged(ruleA.owner);
      return res.status(200).json({ message: 'OK' });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

  getDropdownTags = async (req: Request, res: Response): Promise<Response> => {
    try {
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.header('Expires', '-1');
      res.header('Pragma', 'no-cache');
      
      const ownerScope = this.getOwnerScope(req);
      if (ownerScope && req.params.id !== ownerScope) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const ownerId = ownerScope ?? req.params.id;

      const rawTags: string[] = await Channel.distinct('tags', { owner: ownerId });
      const sortedTags = rawTags.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
      const tags = sortedTags.filter((tag) => !tag.startsWith('id:'));
      const channels = sortedTags.filter((tag) => tag.startsWith('id:'));

      return res.status(200).json({
        tags,
        channels,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };
}
