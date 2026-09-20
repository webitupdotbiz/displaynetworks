import { RuleEngine } from './rule.engine.js';
import { IChannel } from '../models/channel.js';
import { IRule } from '../models/rule.js';

describe('RuleEngine', () => {
  const baseChannel = {
    name: 'test-channel',
    owner: 'owner-id',
    value: 'https://default.example',
    tags: [],
    isActive: true,
    displayName: 'Test Channel',
    search: 'test-channel',
    matchedRuleName: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  } as unknown as IChannel;

  const makeRule = (overrides: Partial<IRule> = {}): IRule => ({
    name: 'Rule',
    owner: 'owner-id',
    overrideUrl: 'https://example.com',
    matchStrategy: 'ANY',
    tags: [],
    priority: 1,
    isActive: true,
    ...overrides
  });

  const makeChannel = (tags: string[] = []): IChannel => ({
    ...baseChannel,
    tags
  } as IChannel);

  it('matches a narrow time window when the current time is inside it', () => {
    const rule = makeRule({ startTime: '18:00', endTime: '18:30' });

    const match = RuleEngine.findFirstMatch(baseChannel, [rule], new Date(2024, 0, 1, 18, 5));

    expect(match).toBe(rule);
  });

  it('matches a cross-midnight time window when the current time is inside it', () => {
    const rule = makeRule({ startTime: '22:00', endTime: '02:00' });

    const match = RuleEngine.findFirstMatch(baseChannel, [rule], new Date(2024, 0, 1, 23, 30));

    expect(match).toBe(rule);
  });

  it('skips a rule when no tag matches the ANY strategy', () => {
    const rule = makeRule({ tags: ['news'], matchStrategy: 'ANY' });

    const match = RuleEngine.findFirstMatch(makeChannel(['sports']), [rule], new Date(2024, 0, 1, 12, 0));

    expect(match).toBeNull();
  });

  it('matches when every tag satisfies the ALL strategy', () => {
    const rule = makeRule({ tags: ['news', 'sports'], matchStrategy: 'ALL' });

    const match = RuleEngine.findFirstMatch(makeChannel(['news', 'sports', 'tech']), [rule], new Date(2024, 0, 1, 12, 0));

    expect(match).toBe(rule);
  });

  it('respects start and end date boundaries', () => {
    const rule = makeRule({ startDate: new Date('2024-01-01T00:00:00.000Z'), endDate: new Date('2024-01-02T00:00:00.000Z') });

    expect(RuleEngine.findFirstMatch(baseChannel, [rule], new Date('2024-01-01T12:00:00.000Z'))).toBe(rule);
    expect(RuleEngine.findFirstMatch(baseChannel, [rule], new Date('2024-01-03T12:00:00.000Z'))).toBeNull();
  });

  it('skips rules outside the configured day of week', () => {
    const rule = makeRule({ daysOfWeek: [2] });

    const match = RuleEngine.findFirstMatch(baseChannel, [rule], new Date(2024, 0, 1, 12, 0));

    expect(match).toBeNull();
  });

  it('skips rules when the time string cannot be parsed', () => {
    const rule = makeRule({ startTime: 'invalid', endTime: '18:30' });

    const match = RuleEngine.findFirstMatch(baseChannel, [rule], new Date(2024, 0, 1, 12, 0));

    expect(match).toBeNull();
  });

  it('uses the selected rule timezone for GLOBAL_INSTANT scheduling', () => {
    const rule = makeRule({
      scheduleType: 'GLOBAL_INSTANT',
      timezone: 'America/New_York',
      startTime: '09:00',
      endTime: '09:00'
    });

    const match = RuleEngine.findFirstMatch(baseChannel, [rule], new Date('2024-01-01T14:00:00.000Z'));

    expect(match).toBe(rule);
  });

  it('falls back to the selected timezone when display timezone is missing in CLIENT_CLOCK mode', () => {
    const rule = makeRule({
      scheduleType: 'CLIENT_CLOCK',
      timezone: 'America/New_York',
      startTime: '09:00',
      endTime: '09:00'
    });

    const match = RuleEngine.findFirstMatch(baseChannel, [rule], {
      now: new Date('2024-01-01T14:00:00.000Z')
    } as any);

    expect(match).toBe(rule);
  });

  it('uses display timezone before selected timezone in CLIENT_CLOCK mode', () => {
    const rule = makeRule({
      scheduleType: 'CLIENT_CLOCK',
      timezone: 'America/New_York',
      startTime: '05:00',
      endTime: '05:00'
    });

    const match = RuleEngine.findFirstMatch(baseChannel, [rule], {
      now: new Date('2024-01-01T05:00:00.000Z'),
      displayTimezone: 'UTC'
    } as any);

    expect(match).toBe(rule);
  });
});
