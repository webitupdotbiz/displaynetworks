import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '..', '.env-prod');
dotenv.config({ path: envPath });

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node sys/notify.js <recipient> "<subject>" "<message>"');
  process.exit(1);
}

const [recipient, subject, message] = args;

const API_HOST = 'localhost';
const API_PORT = process.env.PORT || 3000;
const APP_ADMIN_LOGIN_EMAIL = process.env.APP_ADMIN_LOGIN_EMAIL;
const APP_ADMIN_LOGIN_PASSWORD = process.env.APP_ADMIN_LOGIN_PASSWORD;

if (!APP_ADMIN_LOGIN_EMAIL || !APP_ADMIN_LOGIN_PASSWORD) {
  console.error('APP_ADMIN_LOGIN_EMAIL and APP_ADMIN_LOGIN_PASSWORD environment variables are required');
  process.exit(1);
}

const loginData = JSON.stringify({ email: APP_ADMIN_LOGIN_EMAIL, password: APP_ADMIN_LOGIN_PASSWORD });

const loginOptions = {
  hostname: API_HOST,
  port: API_PORT,
  path: '/_api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
};

const loginReq = http.request(loginOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const loginResponse = JSON.parse(data);
        const token = loginResponse.accessToken || loginResponse.token;
        if (typeof token !== 'string' || token.length === 0) {
          console.error('Login response did not include an access token');
          process.exit(1);
        }
        sendNotification(token);
      } catch (err) {
        console.error('Failed to parse login response:', err.message);
        process.exit(1);
      }
    } else {
      console.error(`Login failed: ${res.statusCode}`);
      process.exit(1);
    }
  });
});

loginReq.on('error', (e) => {
  console.error(`Login request error: ${e.message}`);
  process.exit(1);
});

loginReq.write(loginData);
loginReq.end();

function sendNotification(token) {
  const postData = JSON.stringify({
    recipient,
    subject,
    message
  });

  const notifyOptions = {
    hostname: API_HOST,
    port: API_PORT,
    path: '/_api/notify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'x-access-token': token
    }
  };

  const notifyReq = http.request(notifyOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('Message sent');
        process.exit(0);
      } else {
        console.error(`Notify failed: ${res.statusCode} - ${data}`);
        process.exit(1);
      }
    });
  });

  notifyReq.on('error', (e) => {
    console.error(`Notify request error: ${e.message}`);
    process.exit(1);
  });

  notifyReq.write(postData);
  notifyReq.end();
}
