import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response } from 'express';
import type RuleCtrlClass from './rule.js';
import { IRule } from '../models/rule.js';
import type { MockFn } from '../types/test.js';

type RuleDoc = Partial<IRule> & { _id?: string; save?: MockFn<() => Promise<unknown>> };

const mockChannelDistinct = jest.fn() as unknown as MockFn<(field: string, filter?: Record<string, unknown>) => Promise<string[]>>;

jest.unstable_mockModule('../models/channel.js', () => ({
  __esModule: true,
  default: {
    distinct: mockChannelDistinct
  },
  distinct: mockChannelDistinct
}));

const { default: RuleCtrl } = await import('./rule.js');
const { default: Channel } = await import('../models/channel.js');

type MockResponse = Response & {
  status: MockFn<(code: number) => MockResponse>;
  json: MockFn<(data: unknown) => MockResponse>;
  header: MockFn<(name: string, value: string) => MockResponse>;
};

const createResponse = (): MockResponse => ({
  status: (jest.fn() as unknown as MockFn<(code: number) => MockResponse>).mockReturnThis(),
  json: (jest.fn() as unknown as MockFn<(data: unknown) => MockResponse>).mockReturnThis(),
  header: (jest.fn() as unknown as MockFn<(name: string, value: string) => MockResponse>).mockReturnThis()
} as unknown as MockResponse);

const createRequest = (
  query: Record<string, unknown> = {},
  params: Record<string, unknown> = {},
  body: Record<string, unknown> = {}
): Request => ({
  query,
  params,
  body,
  user: { id: 'admin-id', role: 'admin' }
} as unknown as Request);

interface MockModel {
  (body: RuleDoc): RuleDoc;
  countDocuments: MockFn<(params?: Record<string, unknown>) => Promise<number>>;
  find: MockFn<(params: Record<string, unknown>) => {
    limit: MockFn<(n: number) => { sort: MockFn<(criterion: Record<string, number>) => Promise<RuleDoc[]>> }>;
    sort: MockFn<(criterion: Record<string, number>) => Promise<RuleDoc[]>>;
  }>;
  findOne: MockFn<(params?: Record<string, unknown>) => {
    sort: MockFn<(criterion: Record<string, number>) => {
      exec: MockFn<() => Promise<RuleDoc | null>>;
    }>;
  } & Promise<RuleDoc | null>>;
  findById: MockFn<(id: string) => Promise<RuleDoc | null>>;
  findOneAndUpdate: MockFn<(params: Record<string, unknown>, payload: Record<string, unknown>) => Promise<RuleDoc | null>>;
  findOneAndDelete: MockFn<(params: Record<string, unknown>) => Promise<RuleDoc | null>>;
}

describe('RuleCtrl', () => {
  let controller: RuleCtrlClass;
  let model: MockModel;
  let constructorFn: MockFn<(body: RuleDoc) => RuleDoc>;

  beforeEach(() => {
    jest.clearAllMocks();

    constructorFn = jest.fn() as unknown as MockFn<(body: RuleDoc) => RuleDoc>;
    constructorFn.mockImplementation((body: RuleDoc) => ({
      ...body,
      save: (jest.fn() as unknown as MockFn<() => Promise<unknown>>).mockResolvedValue({ _id: 'saved-id', ...body })
    }));

    const countDocumentsFn = jest.fn() as unknown as MockFn<(params?: Record<string, unknown>) => Promise<number>>;
    countDocumentsFn.mockResolvedValue(1);

    const sortFn = jest.fn() as unknown as MockFn<(criterion: Record<string, number>) => Promise<RuleDoc[]>>;
    sortFn.mockResolvedValue([{ _id: 'rule-1', priority: 0 }]);

    const limitFn = jest.fn() as unknown as MockFn<(n: number) => { sort: typeof sortFn }>;
    limitFn.mockReturnValue({ sort: sortFn });

    const findFn = jest.fn() as unknown as MockFn<(params: Record<string, unknown>) => { limit: typeof limitFn; sort: typeof sortFn }>;
    findFn.mockReturnValue({ limit: limitFn, sort: sortFn });

    const execFn = jest.fn() as unknown as MockFn<() => Promise<RuleDoc | null>>;
    execFn.mockResolvedValue({ _id: 'rule-max', priority: 5 });

    const findOneSortFn = jest.fn() as unknown as MockFn<(criterion: Record<string, number>) => { exec: typeof execFn }>;
    findOneSortFn.mockReturnValue({ exec: execFn });

    const findOneFn = jest.fn() as unknown as MockFn<(params?: Record<string, unknown>) => { sort: typeof findOneSortFn } & Promise<RuleDoc | null>>;
    const findOnePromise = Promise.resolve({ _id: 'rule-max', priority: 5 } as RuleDoc);
    const findOneQuery = Object.assign(findOnePromise, {
      sort: findOneSortFn
    });
    findOneFn.mockReturnValue(findOneQuery as unknown as ReturnType<MockModel['findOne']>);

    const findByIdFn = jest.fn() as unknown as MockFn<(id: string) => Promise<RuleDoc | null>>;
    findByIdFn.mockResolvedValue({
      _id: 'rule-1',
      owner: 'owner-1',
      priority: 2,
      save: (jest.fn() as unknown as MockFn<() => Promise<unknown>>).mockResolvedValue(true)
    });

    const findOneAndUpdateFn = jest.fn() as unknown as MockFn<(params: Record<string, unknown>, payload: Record<string, unknown>) => Promise<RuleDoc | null>>;
    findOneAndUpdateFn.mockResolvedValue({});

    const findOneAndDeleteFn = jest.fn() as unknown as MockFn<(params: Record<string, unknown>) => Promise<RuleDoc | null>>;
    findOneAndDeleteFn.mockResolvedValue({});

    model = Object.assign(constructorFn, {
      countDocuments: countDocumentsFn,
      find: findFn,
      findOne: findOneFn,
      findById: findByIdFn,
      findOneAndUpdate: findOneAndUpdateFn,
      findOneAndDelete: findOneAndDeleteFn
    });

    controller = new RuleCtrl();
    controller.model = model as unknown as typeof controller.model;
  });

  it('getOrderedRules returns sorted rules and handles infinite scroll priority cursor', async () => {
    const req = createRequest({ term: 'promo' }, { id: 'owner-1', last: '2' });
    const res = createResponse();

    await controller.getOrderedRules(req, res);

    expect(res.header).toHaveBeenCalledWith('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    expect(model.countDocuments).toHaveBeenCalledWith(expect.objectContaining({
      search: expect.any(RegExp),
      owner: 'owner-1'
    }));
    expect(model.find).toHaveBeenCalledWith(expect.objectContaining({
      search: expect.any(RegExp),
      owner: 'owner-1',
      priority: { $gt: 2 }
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ count: 1, rules: [{ _id: 'rule-1', priority: 0 }] });
  });

  it('getOrderedRules catches errors and returns 400 status', async () => {
    model.countDocuments.mockRejectedValueOnce(new Error('Fetch failure'));
    const req = createRequest();
    const res = createResponse();

    await controller.getOrderedRules(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Fetch failure' });
  });

  it('limits group users to their group owner and rejects another owner route', async () => {
    const req = createRequest({}, { id: 'group-owner' });
    req.user = { id: 'member-id', role: 'group-owner' };
    const res = createResponse();

    await controller.getOrderedRules(req, res);
    expect(model.find).toHaveBeenCalledWith(expect.objectContaining({ owner: 'group-owner' }));

    const outsideGroupRequest = createRequest({}, { id: 'another-group' });
    outsideGroupRequest.user = { id: 'member-id', role: 'group-owner' };
    const forbiddenResponse = createResponse();
    await controller.getOrderedRules(outsideGroupRequest, forbiddenResponse);
    expect(forbiddenResponse.status).toHaveBeenCalledWith(403);
  });

  it('gets a rule only within its owner scope and returns 404 when absent', async () => {
    model.findOne.mockResolvedValueOnce({ _id: 'rule-1', owner: 'owner-1' });
    const req = createRequest({}, { id: 'owner-1', ruleId: 'rule-1' });
    const res = createResponse();

    await controller.get(req, res);

    expect(model.findOne).toHaveBeenCalledWith({ _id: 'rule-1', owner: 'owner-1' });
    expect(res.status).toHaveBeenCalledWith(200);

    model.findOne.mockResolvedValueOnce(null);
    const missingResponse = createResponse();
    await controller.get(req, missingResponse);

    expect(missingResponse.status).toHaveBeenCalledWith(404);
    expect(missingResponse.json).toHaveBeenCalledWith({ error: 'Rule not found' });
  });

  it('getOrderedRules rejects an invalid search query shape', async () => {
    const req = createRequest({ term: 123 as unknown }, { id: 'owner-1', last: 'not-a-number' });
    const res = createResponse();

    await controller.getOrderedRules(req, res);

    expect(model.find).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'term must be a string' });
  });

  it('inserts a new rule ahead of the current first priority', async () => {
    const req = createRequest({}, {}, { owner: 'owner-1', tags: ['Retail', ' ID:Lobby '] });
    const res = createResponse();

    await controller.insert(req, res);

    expect(model.findOne).toHaveBeenCalledWith({ owner: 'owner-1' });
    expect(constructorFn).toHaveBeenCalledWith({
      owner: 'owner-1',
      isActive: true,
      scheduleType: 'CLIENT_CLOCK',
      timezone: 'UTC',
      tags: ['retail', 'id:lobby'],
      priority: 4
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('insert accepts explicit scheduleType and timezone values', async () => {
    const req = createRequest({}, {}, {
      owner: 'owner-2',
      tags: [' News '],
      scheduleType: 'GLOBAL_INSTANT',
      timezone: 'America/New_York'
    });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).toHaveBeenCalledWith(expect.objectContaining({
      scheduleType: 'GLOBAL_INSTANT',
      timezone: 'America/New_York',
      tags: ['news']
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('insert accepts null time restrictions', async () => {
    const req = createRequest({}, {}, {
      owner: 'owner-1',
      startTime: null,
      endTime: null
    });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).toHaveBeenCalledWith(expect.objectContaining({
      startTime: null,
      endTime: null
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('insert returns 400 for invalid scheduleType', async () => {
    const req = createRequest({}, {}, {
      owner: 'owner-1',
      scheduleType: 'BAD_MODE'
    });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid scheduleType. Must be CLIENT_CLOCK or GLOBAL_INSTANT.'
    });
  });

  it('insert returns 400 for invalid timezone type', async () => {
    const req = createRequest({}, {}, {
      owner: 'owner-1',
      timezone: 123
    });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'timezone must be a string'
    });
  });

  it('insert returns 400 for invalid timezone value', async () => {
    const req = createRequest({}, {}, {
      owner: 'owner-1',
      timezone: 'Not/AZone'
    });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid timezone. Must be a valid IANA timezone string.'
    });
  });

  it('insert maps non-Error failures to unknown error message', async () => {
    model.findOne.mockImplementationOnce(() => {
      throw 'insert boom';
    });
    const req = createRequest({}, {}, { owner: 'owner-1' });
    const res = createResponse();

    await controller.insert(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unknown error occurred' });
  });

  it('insert defaults priority to 0 if collection is completely empty', async () => {
    const findOneSortFn = jest.fn() as unknown as MockFn<(criterion: Record<string, number>) => { exec: MockFn<() => Promise<RuleDoc | null>> }>;
    findOneSortFn.mockReturnValue({
      exec: (jest.fn() as unknown as MockFn<() => Promise<RuleDoc | null>>).mockResolvedValue(null)
    });
    model.findOne.mockReturnValueOnce({ sort: findOneSortFn } as unknown as ReturnType<MockModel['findOne']>);

    const req = createRequest({}, {}, { owner: 'owner-1', tags: [] });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).toHaveBeenCalledWith(expect.objectContaining({ priority: 0 }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('count returns scoped owner count', async () => {
    model.countDocuments.mockResolvedValueOnce(4);
    const req = createRequest({}, { id: 'owner-1' });
    const res = createResponse();

    await controller.count(req, res);

    expect(model.countDocuments).toHaveBeenCalledWith({ owner: 'owner-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(4);
  });

  it('count returns 400 on database errors', async () => {
    model.countDocuments.mockRejectedValueOnce(new Error('count failure'));
    const req = createRequest({}, { id: 'owner-1' });
    const res = createResponse();

    await controller.count(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'count failure' });
  });

  it('count without owner filter queries all rules', async () => {
    model.countDocuments.mockResolvedValueOnce(7);
    const req = createRequest({}, {});
    const res = createResponse();

    await controller.count(req, res);

    expect(model.countDocuments).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(7);
  });

  it('update sanitizes empty form elements to null and returns 200 OK', async () => {
    const req = createRequest({}, { id: 'rule-1' }, {
      tags: ['Promo'],
      startDate: '',
      endDate: '',
      startTime: '',
      endTime: ''
    });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'rule-1' },
      {
        tags: ['promo'],
        startDate: null,
        endDate: null,
        startTime: null,
        endTime: null
      }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'OK' });
  });

  it('update accepts null time restrictions', async () => {
    const req = createRequest({}, { id: 'rule-1' }, {
      startTime: null,
      endTime: null
    });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'rule-1' },
      { startTime: null, endTime: null }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('update accepts ruleId param and normalizes schedule/timezone fields', async () => {
    const req = createRequest({}, { ruleId: 'rule-1' }, {
      scheduleType: 'GLOBAL_INSTANT',
      timezone: '',
      tags: [' BRANCH ']
    });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'rule-1' },
      expect.objectContaining({
        scheduleType: 'GLOBAL_INSTANT',
        timezone: 'UTC',
        tags: ['branch']
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('update returns 400 for invalid scheduleType in payload', async () => {
    const req = createRequest({}, { id: 'rule-1' }, { scheduleType: 'BAD_MODE' });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid scheduleType. Must be CLIENT_CLOCK or GLOBAL_INSTANT.'
    });
  });

  it('update returns 400 for invalid timezone in payload', async () => {
    const req = createRequest({}, { id: 'rule-1' }, { timezone: 'Not/AZone' });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid timezone. Must be a valid IANA timezone string.'
    });
  });

  it('update maps non-Error failures to unknown error message', async () => {
    model.findById.mockRejectedValueOnce('update boom');
    const req = createRequest({}, { id: 'rule-1' }, {});
    const res = createResponse();

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unknown error occurred' });
  });

  it('update returns 404 when target rule document does not exist', async () => {
    model.findById.mockResolvedValueOnce(null);
    const req = createRequest({}, { id: 'missing-id' }, {});
    const res = createResponse();

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Rule not found.' });
  });

  it('update prefers payload owner when invalidating cache', async () => {
    const req = createRequest({}, { id: 'rule-1' }, {
      owner: 'owner-override',
      tags: ['Promo']
    });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'rule-1' },
      expect.objectContaining({ owner: 'owner-override', tags: ['promo'] })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delete removes item and returns 200 on success', async () => {
    const req = createRequest({}, { id: 'rule-1' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(model.findById).toHaveBeenCalledWith('rule-1');
    expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: 'rule-1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delete returns 404 when target rule does not exist', async () => {
    model.findById.mockResolvedValueOnce(null);
    const req = createRequest({}, { id: 'rule-missing' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Rule not found.' });
  });

  it('delete supports ruleId route param shape', async () => {
    const req = createRequest({}, { ruleId: 'rule-1' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(model.findById).toHaveBeenCalledWith('rule-1');
    expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: 'rule-1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delete returns 400 when delete operation throws', async () => {
    model.findById.mockRejectedValueOnce(new Error('delete failure'));
    const req = createRequest({}, { id: 'rule-1' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'delete failure' });
  });

  it('delete maps non-Error failures to unknown error message', async () => {
    model.findById.mockRejectedValueOnce('delete boom');
    const req = createRequest({}, { id: 'rule-1' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unknown error occurred' });
  });

  it('swapPriority executes transactional arithmetic variable swapping', async () => {
    const mockRuleA: RuleDoc = {
      _id: 'A',
      owner: 'owner-1',
      priority: 10,
      save: (jest.fn() as unknown as MockFn<() => Promise<unknown>>).mockResolvedValue(true)
    };
    const mockRuleB: RuleDoc = {
      _id: 'B',
      owner: 'owner-1',
      priority: 20,
      save: (jest.fn() as unknown as MockFn<() => Promise<unknown>>).mockResolvedValue(true)
    };

    model.findOne
      .mockResolvedValueOnce(mockRuleA)
      .mockResolvedValueOnce(mockRuleB);

    const req = createRequest({}, {}, { ruleIdA: 'A', ruleIdB: 'B', ownerId: 'owner-1' });
    const res = createResponse();

    await controller.swapPriority(req, res);

    expect(mockRuleA.priority).toBe(20);
    expect(mockRuleB.priority).toBe(10);
    expect(mockRuleA.save).toHaveBeenCalled();
    expect(mockRuleB.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('swapPriority blocks execution if variables parameters are missing', async () => {
    const req = createRequest({}, {}, { ruleIdA: 'A' });
    const res = createResponse();

    await controller.swapPriority(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing swap transaction variables.' });
  });

  it('swapPriority returns 404 when one or both rules are missing', async () => {
    model.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'B', owner: 'owner-1', priority: 2, save: jest.fn() as unknown as MockFn<() => Promise<unknown>> });

    const req = createRequest({}, {}, { ruleIdA: 'A', ruleIdB: 'B', ownerId: 'owner-1' });
    const res = createResponse();

    await controller.swapPriority(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Rules not found or scope mismatched.' });
  });

  it('swapPriority returns 400 when lookup throws', async () => {
    model.findOne.mockRejectedValueOnce(new Error('swap failure'));
    const req = createRequest({}, {}, { ruleIdA: 'A', ruleIdB: 'B', ownerId: 'owner-1' });
    const res = createResponse();

    await controller.swapPriority(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'swap failure' });
  });

  it('swapPriority maps non-Error failures to unknown error message', async () => {
    model.findOne.mockRejectedValueOnce('swap boom');
    const req = createRequest({}, {}, { ruleIdA: 'A', ruleIdB: 'B', ownerId: 'owner-1' });
    const res = createResponse();

    await controller.swapPriority(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unknown error occurred' });
  });

  it('getDropdownTags partitions channel identifiers from organization tags', async () => {
    const mockDistinctTags = ['id:lobby-display', 'marketing', 'id:bar-screen', 'retail'];
    mockChannelDistinct.mockResolvedValueOnce(mockDistinctTags);

    const req = createRequest({}, { id: 'owner-1' });
    const res = createResponse();

    await controller.getDropdownTags(req, res);

    expect(Channel.distinct).toHaveBeenCalledWith('tags', { owner: 'owner-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      tags: ['marketing', 'retail'],
      channels: ['id:bar-screen', 'id:lobby-display']
    });
  });

  it('getDropdownTags returns 400 when distinct lookup fails', async () => {
    mockChannelDistinct.mockRejectedValueOnce(new Error('distinct failure'));
    const req = createRequest({}, { id: 'owner-1' });
    const res = createResponse();

    await controller.getDropdownTags(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'distinct failure' });
  });

  it('getDropdownTags returns unknown error message for non-Error throws', async () => {
    mockChannelDistinct.mockRejectedValueOnce('boom');
    const req = createRequest({}, { id: 'owner-1' });
    const res = createResponse();

    await controller.getDropdownTags(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unknown error occurred' });
  });
});
