import { ObjectId } from 'bson';

export class Entry {
  _id?: ObjectId | undefined;
  name: string = '';
  displayName: string = ''
  owner: ObjectId | undefined;
  value: string = '';
  tags: String[] = [];
  notes: string = '';
  search?: string = '';
  updatedAt?: string = '';
}
