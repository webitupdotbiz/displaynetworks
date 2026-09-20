import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

const mockCompare = jest.fn<(candidate: string, hash: string) => Promise<boolean>>();
const mockGenSalt = jest.fn<(rounds?: number) => Promise<string>>();
const mockHash = jest.fn<(data: string, salt: string | number) => Promise<string>>();

jest.unstable_mockModule('bcryptjs', () => ({
  __esModule: true,
  default: {
    compare: mockCompare,
    genSalt: mockGenSalt,
    hash: mockHash
  },
  compare: mockCompare,
  genSalt: mockGenSalt,
  hash: mockHash
}));

const mongoose = (await import('mongoose')).default;
const { default: Channel } = await import('./channel.js');
const { default: Rule } = await import('./rule.js');
const { default: User } = await import('./user.js');

type SchemaWithHooks = {
  s?: {
    hooks?: {
      _pres?: Map<string, unknown[]>;
    };
  };
};

function getPreSaveHook(schema: SchemaWithHooks, snippet: string) {
  const hooks = schema.s?.hooks?._pres?.get('save') || [];
  if (!hooks.length) return undefined;
  return hooks
    .map((entry: unknown) => (entry as { fn?: unknown }).fn || entry)
    .find((fn: unknown) => typeof fn === 'function' && fn.toString().includes(snippet));
}

describe('server/models', () => {
  beforeAll(() => {
    mongoose.modelNames().forEach((name) => {
      if (mongoose.models[name]) {
        mongoose.deleteModel(name);
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Channel model', () => {
    it('defines the Channel model with schema validation and index', () => {
      expect(Channel.modelName).toBe('Channels');
      expect(Channel.schema.options.timestamps).toBe(true);

      const namePath = Channel.schema.path('name');
      expect((namePath.options as Record<string, unknown>).unique).toBe(true);
      expect((namePath.options as Record<string, unknown>).lowercase).toBe(true);
      expect((namePath.options as Record<string, unknown>).match).toEqual(/^[a-zA-Z0-9-]+$/);
      expect(((namePath.options as Record<string, unknown>).validate as { validator: (v: string) => boolean }).validator('abc-123')).toBe(true);
      expect(((namePath.options as Record<string, unknown>).validate as { validator: (v: string) => boolean }).validator('bad value')).toBe(false);

      const indexes = Channel.schema.indexes();
      expect(indexes.some((entry: Record<string, unknown>[]) => (entry[0] as Record<string, unknown>).name === 'text' && (entry[0] as Record<string, unknown>).owner === 1)).toBe(true);
    });
  });

  describe('User model', () => {
    it('defines the User model and strips password from JSON output', () => {
      expect(User.modelName).toBe('User');
      const emailPath = User.schema.path('email');
      expect((emailPath.options as Record<string, unknown>).unique).toBe(true);
      expect((emailPath.options as Record<string, unknown>).lowercase).toBe(true);
      expect((emailPath.options as Record<string, unknown>).trim).toBe(true);

      const user = new User({ email: 'ADMIN@EXAMPLE.COM', password: 'secret', role: 'admin' });
      const json = user.toJSON();

      expect(json.password).toBeUndefined();
      expect(json.role).toBe('admin');
    });

    it('comparePassword returns false when password is missing', async () => {
      const user = new User({});
      user.password = '';
      const isMatch = await user.comparePassword('secret');

      expect(isMatch).toBe(false);
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('comparePassword calls bcrypt.compare and forwards the result when password exists', async () => {
      mockCompare.mockResolvedValue(true);

      const user = new User({ password: 'hashed_password_string' });
      const isMatch = await user.comparePassword('secret');

      expect(isMatch).toBe(true);
      expect(mockCompare).toHaveBeenCalledWith('secret', user.password);
    });

    it('pre-save hook hashes password when modified and present', async () => {
      mockGenSalt.mockResolvedValue('salt');
      mockHash.mockResolvedValue('hashed-pass');

      const hook = getPreSaveHook(User.schema as SchemaWithHooks, 'genSalt');
      expect(hook).toBeDefined();

      const context = {
        isModified: jest.fn().mockReturnValue(true),
        password: 'rawPassword'
      };

      await (hook as (this: typeof context) => Promise<void>).call(context);

      expect(context.isModified).toHaveBeenCalledWith('password');
      expect(mockGenSalt).toHaveBeenCalledWith(10);
      expect(mockHash).toHaveBeenCalledWith('rawPassword', 'salt');
      expect(context.password).toBe('hashed-pass');
    });

    it('pre-save hook exits early if password is not modified', async () => {
      const hook = getPreSaveHook(User.schema as SchemaWithHooks, 'genSalt');

      const context = {
        isModified: jest.fn().mockReturnValue(false),
        password: 'existingPassword'
      };

      await (hook as (this: typeof context) => Promise<void>).call(context);

      expect(mockGenSalt).not.toHaveBeenCalled();
      expect(mockHash).not.toHaveBeenCalled();
      expect(context.password).toBe('existingPassword');
    });

    it('pre-save hook exits early if password is empty', async () => {
      const hook = getPreSaveHook(User.schema as SchemaWithHooks, 'genSalt');

      const context = {
        isModified: jest.fn().mockReturnValue(true),
        password: ''
      };

      await (hook as (this: typeof context) => Promise<void>).call(context);

      expect(mockGenSalt).not.toHaveBeenCalled();
      expect(mockHash).not.toHaveBeenCalled();
    });
  });

  describe('Rule model', () => {
    it('persists search text derived from rule notes', () => {
      const rule = new Rule({
        name: 'Texas promotion',
        owner: 'owner-1',
        overrideUrl: 'https://example.com/promotion.mp4',
        matchStrategy: 'ANY',
        tags: [],
        priority: 0,
        isActive: true,
        notes: 'Texas',
        search: 'texas promotion texas'
      });

      expect(rule.search).toBe('texas promotion texas');
    });
  });
});
