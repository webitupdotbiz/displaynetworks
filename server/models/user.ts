import bcrypt from 'bcryptjs';
import { model, Schema, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  id: string;
  email: string;
  password: string;
  role: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: number;
  active: boolean;
  search: string;
  tags: string[];
  notes: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, unique: true, lowercase: true, trim: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: '' },
    resetPasswordToken: String,
    resetPasswordExpires: Number,
    active: { type: Boolean, default: false },
    search: { type: String, default: '' },
    tags: [String],
    notes: { type: String, default: '' },
  },
  {
    timestamps: true
  }
);

userSchema.pre('save', async function (): Promise<void> {
  if (!this.isModified('password') || !this.password) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.set('toJSON', {
  transform: function (_doc, ret: Record<string, any>) {
    delete ret['password'];
    return ret;
  }
});

const User = model<IUser>('User', userSchema);

export default User;
