import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = process.env.NODE_ENV === 'production' ? '.env-prod' : '.env-dev';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not defined in your env file.');
  process.exit(1);
}

const dbName = new URL(uri).pathname.replace('/', '') || 'test';

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};

const email = getArg('--email');
const password = getArg('--password');
const role = getArg('--role');

if (!email || !password || !role) {
  console.error('Usage: NODE_ENV=development node sys/create-admin.js --email user@domain.com --password secret --role admin|groupadmin');
  process.exit(1);
}

if (!['admin', 'groupadmin'].includes(role)) {
  console.error('Invalid role. Must be either "admin" or "groupadmin".');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection('users');

    const existingUser = await users.findOne({ email });
    if (existingUser) {
      console.error(`User with email "${email}" already exists.`);
      return 1;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();

    const newUser = {
      email,
      password: hashedPassword,
      role,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await users.insertOne(newUser);
    console.log(`User "${email}" with role "${role}" created successfully.`);
    return 0;
  } catch (error) {
    console.error('Error creating user:', error);
    return 1;
  } finally {
    await client.close();
  }
}

run().then((exitCode) => {
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
});
