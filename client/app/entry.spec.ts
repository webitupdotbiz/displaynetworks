import { Entry } from './entry';

describe('Entry', () => {
  it('should initialize with the expected default values', () => {
    const entry = new Entry();

    expect(entry._id).toBeUndefined();
    expect(entry.name).toBe('');
    expect(entry.displayName).toBe('');
    expect(entry.owner).toBeUndefined();
    expect(entry.value).toBe('');
    expect(entry.tags).toEqual([]);
    expect(entry.search).toBe('');
    expect(entry.updatedAt).toBe('');
  });

  it('should allow fields to be updated after initialization', () => {
    const entry = new Entry();

    entry.name = 'demo';
    entry.displayName = 'Demo Entry';
    entry.owner = { toHexString: () => 'owner-id' } as any;
    entry.value = 'sample';
    entry.tags = ['alpha', 'beta'];
    entry.search = 'demo alpha beta';
    entry.updatedAt = '2026-08-02';

    expect(entry.name).toBe('demo');
    expect(entry.displayName).toBe('Demo Entry');
    expect(entry.owner).toBeDefined();
    expect(entry.value).toBe('sample');
    expect(entry.tags).toEqual(['alpha', 'beta']);
    expect(entry.search).toBe('demo alpha beta');
    expect(entry.updatedAt).toBe('2026-08-02');
  });
});
