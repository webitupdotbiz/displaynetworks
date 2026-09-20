import { model, Schema } from 'mongoose';
export interface IChannel {
  name: string;
  displayName: string;
  owner: string;
  value: string;
  search: string;
  matchedRuleName: string;
  tags: string[];
  notes: string;
}

const channelSchema = new Schema({
  name: { 
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    match: /^[a-zA-Z0-9-]+$/,
    validate: {
      validator: (v: string) => /^[a-zA-Z0-9-]+$/.test(v),
      message: 'Name must contain only alphanumeric characters and dashes'
    }
  },
  displayName: {
    type: String,
    required: true
  },
  owner: String,
  value: String,
  search: String,
  tags: [String],
  notes: { type: String, default: '' }
},
{
  timestamps: true
});

channelSchema.index({ name: 'text', owner: 1 });

const Channel = model<IChannel>('Channels', channelSchema);

export default Channel;
