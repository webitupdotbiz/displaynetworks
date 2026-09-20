import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockConnect = jest.fn<(uri?: string) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('mongoose', () => ({
  __esModule: true,
  default: {
    connect: mockConnect,
    connection: { close: mockClose },
  },
  connect: mockConnect,
  connection: { close: mockClose },
}));

const { connectToMongo, disconnectMongo } = await import('./mongo.js');
const { connect, connection } = await import('mongoose');

describe('server/mongo', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('connects to MONGODB_URI when NODE_ENV is not test', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb://localhost/prod-db';

    await connectToMongo();

    expect(connect).toHaveBeenCalledWith('mongodb://localhost/prod-db');
  });

  it('connects to MONGODB_TEST_URI when NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_TEST_URI = 'mongodb://localhost/test-db';

    await connectToMongo();

    expect(connect).toHaveBeenCalledWith('mongodb://localhost/test-db');
  });

  it('logs the database name after connecting', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb://localhost/prod-db';
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await connectToMongo();

    expect(consoleSpy).toHaveBeenCalledWith('Connected to MongoDB (db: prod-db)');

    consoleSpy.mockRestore();
  });

  it('disconnects from mongoose connection', async () => {
    await disconnectMongo();

    expect(connection.close).toHaveBeenCalled();
  });
});
