import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Define typed handler stubs prior to module loading
const loginHandler = jest.fn((req: Request, res: Response) => res.sendStatus(200));
const channelInsertHandler = jest.fn((req: Request, res: Response) => res.sendStatus(200));
const channelByNameHandler = jest.fn((req: Request, res: Response) => res.sendStatus(200));

// Register async ESM module mocks
jest.unstable_mockModule('./middleware/auth.js', () => ({
  __esModule: true,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => next(),
}));

jest.unstable_mockModule('./controllers/user.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    login: loginHandler,
    refresh: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    reset: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    showReset: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    doReset: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    insert: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    sendInvite: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    getAll: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    count: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    get: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    update: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    delete: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
  })),
}));

jest.unstable_mockModule('./controllers/channel.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getByName: channelByNameHandler,
    getByNameApplyRules: jest.fn((req: Request, res: Response) => res.status(200).json({})),
    count: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    get: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    insert: channelInsertHandler,
    update: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    delete: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    checkNameAvailable: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    getAll: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
  })),
}));

jest.unstable_mockModule('./controllers/rule.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    insert: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    get: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    getOrderedRules: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    count: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    update: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    delete: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    swapPriority: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
    getDropdownTags: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
  })),
}));

jest.unstable_mockModule('./controllers/notify.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    sendNotification: jest.fn((req: Request, res: Response) => res.sendStatus(200)),
  })),
}));

// Dynamic import after registering module mocks
const { default: setRoutes } = await import('./routes.js');

describe('setRoutes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    setRoutes(app);
  });

  it('registers the login route', async () => {
    const response = await request(app).post('/_api/login').send({});

    expect(response.status).toBe(200);
    expect(loginHandler).toHaveBeenCalled();
  });

  it('registers the public channel route', async () => {
    const response = await request(app).get('/_api/channel/surfing');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });

  it('registers protected channels insert route behind auth middleware', async () => {
    const response = await request(app).post('/_api/channels').send({});

    expect(response.status).toBe(200);
    expect(channelInsertHandler).toHaveBeenCalled();
  });
});
