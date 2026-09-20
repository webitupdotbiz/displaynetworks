import { IChannel } from '../models/channel.js';
import { IRule } from '../models/rule.js';

type RuleEvaluationContext = {
  now?: Date;
  displayTimezone?: string;
};

export class RuleEngine {
  /**
   * Evaluates active, pre-sorted rules against a target channel.
   * Returns the first rule that satisfies all constraint metrics.
   */
  public static findFirstMatch(
    channel: IChannel,
    rules: IRule[],
    contextOrNow: RuleEvaluationContext | Date = {}
  ): IRule | null {
    const context = contextOrNow instanceof Date ? { now: contextOrNow } : contextOrNow;
    const now = context.now ?? new Date();

    for (const rule of rules) {
      const currentDayAndMinutes = this.getCurrentDayAndMinutes(now, rule, {
        displayTimezone: context.displayTimezone,
        ruleTimezone: rule.timezone
      });
      if (!currentDayAndMinutes) {
        continue;
      }

      const { currentDay, currentMinutes } = currentDayAndMinutes;

      // Evaluate Tag Strategies
      if (!this.evaluateTags(channel.tags, rule.tags, rule.matchStrategy)) {
        continue;
      }

      // Evaluate Date Range Constraints
      if (rule.startDate && now < new Date(rule.startDate)) continue;
      if (rule.endDate && now > new Date(rule.endDate)) continue;

      // Evaluate Day of Week Availability
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        if (!rule.daysOfWeek.includes(currentDay)) continue;
      }

      // Evaluate Time Window Constraints (Supports cross-midnight spans)
      if (rule.startTime && rule.endTime) {
        const startMinutes = this.toMinutes(rule.startTime);
        const endMinutes = this.toMinutes(rule.endTime);
        if (startMinutes === null || endMinutes === null) {
          continue;
        }
        if (startMinutes <= endMinutes) {
          if (currentMinutes < startMinutes || currentMinutes > endMinutes) continue;
        } else {
          // Range spans across midnight (e.g., 22:00 to 02:00)
          if (currentMinutes < startMinutes && currentMinutes > endMinutes) continue;
        }
      }
      // First match
      return rule;
    }

    return null;
  }

  private static toMinutes(value: Date | string): number | null {
    if (value instanceof Date) {
      return value.getHours() * 60 + value.getMinutes();
    }

    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }

  private static getCurrentDayAndMinutes(
    now: Date,
    rule: IRule,
    context: { displayTimezone?: string; ruleTimezone?: string }
  ): { currentDay: number; currentMinutes: number } | null {
    if (rule.scheduleType === 'GLOBAL_INSTANT') {
      const timezone = this.isValidIanaTimezone(context.ruleTimezone) ? context.ruleTimezone : 'UTC';
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(now);
      const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;
      const hourPart = parts.find((p) => p.type === 'hour')?.value;
      const minutePart = parts.find((p) => p.type === 'minute')?.value;

      if (!weekdayPart || hourPart === undefined || minutePart === undefined) {
        return null;
      }

      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6
      };

      const currentDay = dayMap[weekdayPart];
      const currentHour = Number(hourPart);
      const currentMinute = Number(minutePart);

      if (currentDay === undefined || Number.isNaN(currentHour) || Number.isNaN(currentMinute)) {
        return null;
      }

      return {
        currentDay,
        currentMinutes: currentHour * 60 + currentMinute
      };
    }

    const effectiveDisplayTimezone = this.isValidIanaTimezone(context.displayTimezone) ? context.displayTimezone : context.ruleTimezone;

    if (!effectiveDisplayTimezone) {
      return {
        currentDay: now.getDay(),
        currentMinutes: now.getHours() * 60 + now.getMinutes()
      };
    }

    const tz = this.isValidIanaTimezone(effectiveDisplayTimezone) ? effectiveDisplayTimezone : 'UTC';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(now);
    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;

    if (!weekdayPart || hourPart === undefined || minutePart === undefined) {
      return null;
    }

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6
    };

    const currentDay = dayMap[weekdayPart];
    const currentHour = Number(hourPart);
    const currentMinute = Number(minutePart);

    if (currentDay === undefined || Number.isNaN(currentHour) || Number.isNaN(currentMinute)) {
      return null;
    }

    return {
      currentDay,
      currentMinutes: currentHour * 60 + currentMinute
    };
  }

  private static isValidIanaTimezone(tz: string | undefined): boolean {
    if (!tz || typeof tz !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  private static evaluateTags(channelTags: string[], ruleTags: string[], strategy: 'ANY' | 'ALL'): boolean {
    if (ruleTags.length === 0) return true; // Rule applies globally if no tags assigned
    
    const cTags = channelTags.map(t => t.toLowerCase());
    const rTags = ruleTags.map(t => t.toLowerCase());

    if (strategy === 'ANY') {
      return rTags.some(tag => cTags.includes(tag));
    } else {
      return rTags.every(tag => cTags.includes(tag));
    }
  }
}