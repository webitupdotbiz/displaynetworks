import { model, Schema, Document } from 'mongoose';

export type RuleScheduleType = 'CLIENT_CLOCK' | 'GLOBAL_INSTANT';

export interface IRule {
  name: string;
  owner: string;
  overrideUrl: string;
  matchStrategy: 'ANY' | 'ALL';
  tags: string[];
  notes?: string;
  priority: number;
  isActive: boolean;
  search?: string;
  startTime?: string;
  endTime?: string;
  startDate?: Date;
  endDate?: Date;
  daysOfWeek?: number[];
  scheduleType?: RuleScheduleType;
  timezone?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRuleDoc extends IRule, Document {}

const ruleSchema = new Schema<IRuleDoc>({
  name: { type: String, required: true, trim: true },
  owner: { type: String, required: true },
  overrideUrl: { type: String, required: true, trim: true },
  matchStrategy: { type: String, required: true, enum: ['ANY', 'ALL'], default: 'ANY' },
  tags: { type: [String], required: true, default: [] },
  notes: { type: String, default: '' },
  priority: { type: Number, required: true, default: 0 },
  isActive: { type: Boolean, required: true, default: true },
  search: { type: String, default: '' },
  startTime: { type: String, default: null },
  endTime: { type: String, default: null },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  daysOfWeek: { type: [Number], default: [] },
  scheduleType: { type: String, enum: ['CLIENT_CLOCK', 'GLOBAL_INSTANT'], default: 'CLIENT_CLOCK' },
  timezone: { type: String, default: 'UTC', trim: true }
}, { timestamps: true });

ruleSchema.index({ owner: 1, priority: 1 });
ruleSchema.index({ name: 'text' });

const Rule = model<IRuleDoc>('Rule', ruleSchema);
export default Rule;