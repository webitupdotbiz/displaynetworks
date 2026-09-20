import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response } from 'express';

const notifyChannelChangedMock = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../services/channel.socket.js', () => ({
  __esModule: true,
  notifyChannelChanged: (...args: unknown[]) => notifyChannelChangedMock(...args)
}));

const { default: ChannelCtrl } = await import('./channel.js');
const { RuleEngine } = await import('../services/rule.engine.js');
const { channelCache, rulesCache } = await import('../services/store.cache.js');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
  header: jest.Mock;
};

const createResponse = (): MockResponse => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  header: jest.fn().mockReturnThis()
} as unknown as MockResponse);

const createRequest = (query: any = {}, params: any = {}, body: any = {}) => ({
  query,
  params,
  body,
  user: { id: 'admin-id', role: 'admin' }
} as unknown as Request);

describe('ChannelCtrl', () => {
  let controller: ChannelCtrl;
  let model: any;
  let constructorFn: jest.Mock;
  let ruleModel: any;

  beforeEach(() => {
    notifyChannelChangedMock.mockClear();
    channelCache.clearAll();
    rulesCache.clearAll();

    constructorFn = jest.fn().mockImplementation((body) => ({
      ...body,
      save: jest.fn().mockResolvedValue({ _id: 'saved-id', ...body })
    }));

    model = Object.assign(constructorFn, {
      countDocuments: jest.fn().mockResolvedValue(1),
      find: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([{ _id: '1', value: 'x' }])
      }),
      findOne: jest.fn().mockResolvedValue({ _id: '1', owner: 'owner' }),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      findOneAndDelete: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({})
    });

    ruleModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      })
    };

    controller = new ChannelCtrl();
    controller.model = model;
    controller.ruleModel = ruleModel;
  });

  it('getAll returns results and sets no-cache headers', async () => {
    const req = createRequest({ term: 'test' }, { id: 'owner', last: 'lastid' });
    const res = createResponse();

    await controller.getAll(req, res);

    expect(res.header).toHaveBeenCalledWith('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    expect(model.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ search: expect.any(RegExp), owner: 'owner', _id: { $lt: 'lastid' } }));
    expect(model.find).toHaveBeenCalledWith(expect.objectContaining({ search: expect.any(RegExp), owner: 'owner', _id: { $lt: 'lastid' } }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ count: 1, channels: [{ _id: '1', value: 'x' }] });
  });

  it('getAll returns 400 on error', async () => {
    model.countDocuments.mockRejectedValueOnce(new Error('count failure'));
    const req = createRequest();
    const res = createResponse();

    await controller.getAll(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'count failure' });
  });

  it('scopes group-user channel lists and records to the group owner', async () => {
    const req = createRequest({}, { id: 'group-owner' });
    req.user = { id: 'member-id', role: 'group-owner' };
    const res = createResponse();

    await controller.getAll(req, res);
    expect(model.find).toHaveBeenCalledWith(expect.objectContaining({ owner: 'group-owner' }));

    await controller.get(req, res);
    expect(model.findOne).toHaveBeenCalledWith({ _id: 'group-owner', owner: 'group-owner' });

    const outsideGroupRequest = createRequest({}, { id: 'another-group' });
    outsideGroupRequest.user = { id: 'member-id', role: 'group-owner' };
    const forbiddenResponse = createResponse();
    await controller.getAll(outsideGroupRequest, forbiddenResponse);
    expect(forbiddenResponse.status).toHaveBeenCalledWith(403);
  });

  it('gets a channel by id and reports a missing channel', async () => {
    const req = createRequest({}, { id: 'channel-1' });
    const res = createResponse();

    await controller.get(req, res);

    expect(model.findOne).toHaveBeenCalledWith({ _id: 'channel-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ _id: '1', owner: 'owner' });

    model.findOne.mockResolvedValueOnce(null);
    const missingResponse = createResponse();
    await controller.get(req, missingResponse);

    expect(missingResponse.status).toHaveBeenCalledWith(404);
    expect(missingResponse.json).toHaveBeenCalledWith({ error: 'Channel not found' });
  });

  it('insert converts YouTube value and notifies when name exists', async () => {
    const req = createRequest({}, {}, { name: 'demo', value: 'https://youtu.be/abc123' });
    const res = createResponse();

    await controller.insert(req, res);

    expect(constructorFn).toHaveBeenCalledWith({ name: 'demo', value: 'https://youtube.com/embed/abc123?autoplay=1' });
    expect(notifyChannelChangedMock).toHaveBeenCalledWith('demo');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ _id: 'saved-id', name: 'demo', value: 'https://youtube.com/embed/abc123?autoplay=1' });
  });

  it('insert returns 400 on save error', async () => {
    constructorFn.mockImplementationOnce(() => ({ save: jest.fn().mockRejectedValueOnce(new Error('save failed')) }));
    const req = createRequest({}, {}, { value: 'https://youtu.be/abc123' });
    const res = createResponse();

    await controller.insert(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'save failed' });
  });

  it('update transforms value, invalidates cache and notifies when name is present', async () => {
    const cacheSpy = jest.spyOn(channelCache, 'invalidate');
    const req = createRequest({}, { id: '1' }, { name: 'surf', value: 'https://youtu.be/abc123' });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ _id: '1' }, { name: 'surf', value: 'https://youtube.com/embed/abc123?autoplay=1' });
    expect(cacheSpy).toHaveBeenCalledWith('surf');
    expect(notifyChannelChangedMock).toHaveBeenCalledWith('surf');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'OK' });
  });

  it('update skips invalidation and notification when name is missing', async () => {
    const cacheSpy = jest.spyOn(channelCache, 'invalidate');
    cacheSpy.mockClear();
    const req = createRequest({}, { id: '1' }, { value: 'https://example.com' });
    const res = createResponse();

    await controller.update(req, res);

    expect(cacheSpy).not.toHaveBeenCalled();
    expect(notifyChannelChangedMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('update returns 400 on error', async () => {
    model.findOneAndUpdate.mockRejectedValueOnce(new Error('update failed'));
    const req = createRequest({}, { id: '1' }, { value: 'https://youtu.be/abc123' });
    const res = createResponse();

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'update failed' });
  });

  it('count returns 200 and count value', async () => {
    const req = createRequest({}, { id: '1' });
    const res = createResponse();

    await controller.count(req, res);

    expect(model.countDocuments).toHaveBeenCalledWith({ owner: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(1);
  });

  it('count returns 400 on error', async () => {
    model.countDocuments.mockRejectedValueOnce(new Error('count bad'));
    const req = createRequest();
    const res = createResponse();

    await controller.count(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'count bad' });
  });

  it('delete removes by id and notifies', async () => {
    const cacheSpy = jest.spyOn(channelCache, 'invalidate');
    model.findOneAndDelete
      .mockResolvedValueOnce({ name: 'demo' })
      .mockResolvedValueOnce(null);

    const req = createRequest({}, { id: 'channel-id' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: 'channel-id' });
    expect(cacheSpy).toHaveBeenCalledWith('demo');
    expect(notifyChannelChangedMock).toHaveBeenCalledWith('demo');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delete falls back to name lookup when id lookup misses', async () => {
    const cacheSpy = jest.spyOn(channelCache, 'invalidate');
    model.findOneAndDelete
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'mixed-case' });

    const req = createRequest({}, { id: 'Mixed-Case' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(model.findOneAndDelete).toHaveBeenNthCalledWith(1, { _id: 'Mixed-Case' });
    expect(model.findOneAndDelete).toHaveBeenNthCalledWith(2, { name: 'mixed-case' });
    expect(cacheSpy).toHaveBeenCalledWith('mixed-case');
    expect(notifyChannelChangedMock).toHaveBeenCalledWith('mixed-case');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delete returns 400 on error', async () => {
    model.findOneAndDelete.mockRejectedValueOnce(new Error('delete failed'));
    const req = createRequest({}, { id: 'boom' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'delete failed' });
  });

  it('getByName returns object with sanitized owner', async () => {
    const req = createRequest({}, { name: 'Item' });
    const res = createResponse();

    await controller.getByName(req, res);

    expect(model.findOne).toHaveBeenCalledWith({ name: 'item' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ _id: '1', owner: '' });
  });

  it('getByName returns 404 when channel is missing', async () => {
    model.findOne.mockResolvedValueOnce(null);
    const req = createRequest({}, { name: 'Item' });
    const res = createResponse();

    await controller.getByName(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Channel not found' });
  });

  it('getByName returns 500 on error', async () => {
    model.findOne.mockRejectedValueOnce(new Error('findOne failure'));
    const req = createRequest({}, { name: 'Item' });
    const res = createResponse();

    await controller.getByName(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'findOne failure' });
  });

  it('fetchChannelByName returns plain object when found', async () => {
    model.findOne.mockResolvedValueOnce({
      toObject: jest.fn().mockReturnValue({ name: 'abc' })
    });

    const out = await controller.fetchChannelByName('abc');

    expect(model.findOne).toHaveBeenCalledWith({ name: 'abc' });
    expect(out).toEqual({ name: 'abc' });
  });

  it('fetchChannelByName returns null when missing', async () => {
    model.findOne.mockResolvedValueOnce(null);

    const out = await controller.fetchChannelByName('none');

    expect(out).toBeNull();
  });

  it('fetchActiveRulesForOwner queries active rules sorted by priority', async () => {
    const out = await controller.fetchActiveRulesForOwner('owner-a');

    expect(ruleModel.find).toHaveBeenCalledWith({ owner: 'owner-a', isActive: true });
    expect(out).toEqual([]);
  });

  it('evaluateAndApplyRules uses matching rule override and sanitizes owner', () => {
    const findSpy = jest.spyOn(RuleEngine, 'findFirstMatch').mockReturnValue({
      name: 'Rule A',
      overrideUrl: 'https://override.example',
      owner: 'owner-a',
      matchStrategy: 'ANY',
      tags: [],
      priority: 0,
      isActive: true
    } as any);

    const out = controller.evaluateAndApplyRules({
      name: 'demo',
      displayName: 'Demo',
      owner: 'owner-a',
      value: 'https://default.example',
      search: 'demo',
      matchedRuleName: '',
      tags: []
    } as any, []);

    expect(findSpy).toHaveBeenCalled();
    expect((out as any).owner).toBe('');
    expect(out.value).toBe('https://override.example');
    expect((out as any).matchedRuleName).toBe('Rule A');
  });

  it('getByNameApplyRules returns 500 for invalid channel name', async () => {
    const req = createRequest({}, { name: '   ' });
    const res = createResponse();

    await controller.getByNameApplyRules(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unknown error occurred' });
  });

  it('getByNameApplyRules returns 404 when channel is not found', async () => {
    const fetchSpy = jest.spyOn(controller, 'fetchChannelByName').mockResolvedValueOnce(null);
    const req = createRequest({}, { name: 'missing' });
    const res = createResponse();

    await controller.getByNameApplyRules(req, res);

    expect(fetchSpy).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Channel not found' });
  });

  it('getByNameApplyRules fetches channel/rules, caches and returns applied payload', async () => {
    const fetchChannelSpy = jest.spyOn(controller, 'fetchChannelByName').mockResolvedValueOnce({
      name: 'news',
      displayName: 'News',
      owner: 'owner-b',
      value: 'https://default.example',
      search: 'news',
      matchedRuleName: '',
      tags: ['tag-a']
    } as any);

    const fetchRulesSpy = jest.spyOn(controller, 'fetchActiveRulesForOwner').mockResolvedValueOnce([
      {
        name: 'Rule 1',
        owner: 'owner-b',
        overrideUrl: 'https://override.example',
        matchStrategy: 'ANY',
        tags: ['tag-a'],
        priority: 0,
        isActive: true
      } as any
    ]);

    const applySpy = jest.spyOn(controller, 'evaluateAndApplyRules').mockReturnValue({
      name: 'news',
      displayName: 'News',
      owner: '',
      value: 'https://override.example',
      search: 'news',
      matchedRuleName: 'Rule 1',
      tags: ['tag-a']
    } as any);

    const req = createRequest({}, { name: 'news' });
    const res = createResponse();

    await controller.getByNameApplyRules(req, res);

    expect(fetchChannelSpy).toHaveBeenCalledWith('news');
    expect(fetchRulesSpy).toHaveBeenCalledWith('owner-b');
    expect(channelCache.get('news')).toBeTruthy();
    expect(rulesCache.get('owner-b')).toBeTruthy();
    expect(applySpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ value: 'https://override.example' }));
  });

  it('getByNameApplyRules uses cached channel and rules without fetch calls', async () => {
    channelCache.set('cached', {
      name: 'cached',
      displayName: 'Cached',
      owner: 'owner-c',
      value: 'https://default.example',
      search: 'cached',
      matchedRuleName: '',
      tags: []
    } as any);
    rulesCache.set('owner-c', [] as any);

    const fetchChannelSpy = jest.spyOn(controller, 'fetchChannelByName');
    const fetchRulesSpy = jest.spyOn(controller, 'fetchActiveRulesForOwner');

    const req = createRequest({}, { name: 'cached' });
    const res = createResponse();

    await controller.getByNameApplyRules(req, res);

    expect(fetchChannelSpy).not.toHaveBeenCalled();
    expect(fetchRulesSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getByNameApplyRules returns 500 on unexpected exception', async () => {
    jest.spyOn(controller, 'fetchChannelByName').mockRejectedValueOnce(new Error('explode'));

    const req = createRequest({}, { name: 'boom' });
    const res = createResponse();

    await controller.getByNameApplyRules(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'explode' });
  });

  it('checkNameAvailable returns false when name not found', async () => {
    model.findOne.mockResolvedValueOnce(null);
    const req = createRequest({}, { name: 'hello' });
    const res = createResponse();

    await controller.checkNameAvailable(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ exists: false });
  });

  it('checkNameAvailable returns true when found', async () => {
    model.findOne.mockResolvedValueOnce({ _id: 'x' });
    const req = createRequest({}, { name: 'hello' });
    const res = createResponse();

    await controller.checkNameAvailable(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ exists: true });
  });

  it('checkNameAvailable returns 400 on error', async () => {
    model.findOne.mockRejectedValueOnce(new Error('lookup failed'));
    const req = createRequest({}, { name: 'hello' });
    const res = createResponse();

    await controller.checkNameAvailable(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'lookup failed' });
  });
});
