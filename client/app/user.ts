import { ObjectId } from 'bson';

export interface UserType {
    _id?: ObjectId | undefined;
    email: string;
    password: string;
    role: string;
    resetPasswordToken?: string; 
    resetPasswordExpires?: number;
    active: boolean;
    search: string,
    tags: string[],
    notes: string,
    updatedAt: string,
  }

  export interface UserPayloadType {
    email: string;
    search: string,
    tags: String[],
    notes: string,
  }
  