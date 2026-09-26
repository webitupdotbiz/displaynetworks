import { Request, Response } from 'express';
import BaseCtrl from './base.js';

interface TestModelDocument {
  _id?: string;
  name?: string;
  save?: jest.Mock;
}

type ModelMethods = {
  find: jest.Mock;
  countDocuments: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  findOneAndDelete: jest.Mock;
  deleteMany: jest.Mock;
};

type TestModelMock = jest.Mock & ModelMethods;

class TestCtrl extends BaseCtrl<TestModelDocument> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;

  constructor(model: TestModelMock) {
    super();
    this.model = model;
  }
}

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

const createResponse = (): MockResponse => {
  const res: Partial<MockResponse> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res as MockResponse;
};

const createRequest = (params: Record<string, unknown> = {}, body: Record<string, unknown> = {}) => {
  return { params, body } as unknown as Request;
};

describe('BaseCtrl', () => {
  let modelConstructor: jest.Mock;
  let model: ModelMethods;
  let controller: TestCtrl;

  beforeEach(() => {
    modelConstructor = jest.fn().mockImplementation((body: Record<string, unknown>) => ({
      ...body,
      save: jest.fn().mockResolvedValue({ _id: 'saved-id', ...body })
    }));

    model = {
      find: jest.fn().mockResolvedValue([{ _id: '1' }]),
      countDocuments: jest.fn().mockResolvedValue(5),
      findOne: jest.fn().mockResolvedValue({ _id: '1' }),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: '1' }),
      findOneAndDelete: jest.fn().mockResolvedValue({ _id: '1' }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 })
    };

    Object.assign(modelConstructor, model);
    controller = new TestCtrl(modelConstructor as unknown as TestModelMock);
  });

  it('getAll returns 200 with documents', async () => {
    const req = createRequest();
    const res = createResponse();

    await controller.getAll(req, res);

    expect(model.find).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: '1' }]);
  });

  it('getAll returns 400 on error', async () => {
    model.find.mockRejectedValueOnce(new Error('find failed'));
    const req = createRequest();
    const res = createResponse();

    await controller.getAll(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'find failed' });
  });

  it('count returns 200 with document count', async () => {
    const req = createRequest();
    const res = createResponse();

    await controller.count(req, res);

    expect(model.countDocuments).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(5);
  });

  it('count returns 400 on error', async () => {
    model.countDocuments.mockRejectedValueOnce(new Error('count failed'));
    const req = createRequest();
    const res = createResponse();

    await controller.count(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'count failed' });
  });

  it('insert saves and returns a new object', async () => {
    const body = { name: 'new-item' };
    const req = createRequest({}, body);
    const res = createResponse();

    await controller.insert(req, res);

    expect(modelConstructor).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ _id: 'saved-id', ...body });
  });

  it('insert returns 400 on error', async () => {
    modelConstructor.mockImplementationOnce(() => ({
      save: jest.fn().mockRejectedValueOnce(new Error('save failed'))
    }));
    const req = createRequest({}, { name: 'bad' });
    const res = createResponse();

    await controller.insert(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'save failed' });
  });

  it('get returns 200 with object found by id', async () => {
    const req = createRequest({ id: '1' });
    const res = createResponse();

    await controller.get(req, res);

    expect(model.findOne).toHaveBeenCalledWith({ _id: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ _id: '1' });
  });

  it('get returns 500 on error', async () => {
    model.findOne.mockRejectedValueOnce(new Error('get failed'));
    const req = createRequest({ id: '1' });
    const res = createResponse();

    await controller.get(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'get failed' });
  });

  it('update returns 200 when update succeeds', async () => {
    const req = createRequest({ id: '1' }, { name: 'updated' });
    const res = createResponse();

    await controller.update(req, res);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ _id: '1' }, { name: 'updated' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'OK' });
  });

  it('update returns 400 on error', async () => {
    model.findOneAndUpdate.mockRejectedValueOnce(new Error('update failed'));
    const req = createRequest({ id: '1' }, { name: 'updated' });
    const res = createResponse();

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'update failed' });
  });

  it('delete returns 200 when delete succeeds', async () => {
    const req = createRequest({ id: '1' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'OK' });
  });

  it('delete returns 400 on error', async () => {
    model.findOneAndDelete.mockRejectedValueOnce(new Error('delete failed'));
    const req = createRequest({ id: '1' });
    const res = createResponse();

    await controller.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'delete failed' });
  });

  it('deleteAll returns 200 when collection is dropped', async () => {
    const req = createRequest();
    const res = createResponse();

    await controller.deleteAll(req, res);

    expect(model.deleteMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'OK' });
  });

  it('deleteAll returns 400 on error', async () => {
    model.deleteMany.mockRejectedValueOnce(new Error('deleteAll failed'));
    const req = createRequest();
    const res = createResponse();

    await controller.deleteAll(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'deleteAll failed' });
  });
});
