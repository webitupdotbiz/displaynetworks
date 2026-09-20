import 'dotenv/config';
import http from 'http';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { join as pathJoin } from 'path';

import { connectToMongo } from './mongo.js';
import setRoutes from './routes.js';
import { startChannelSocketServer } from './services/channel.socket.js';
import { getJwtSecret } from './middleware/utils/jwt.js';
import * as dotenv from 'dotenv';
const envName = process.env.NODE_ENV === 'production' ? 'prod' : (process.env.NODE_ENV || 'dev');
const envFile = `.env-${envName}`;
dotenv.config({
  path: envFile
});

const app = express();
const publicDir = pathJoin(process.cwd(), 'public');
app.set('port', (process.env.PORT || 3000));
app.use('/', express.static(publicDir));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

setRoutes(app);

export const main = async (): Promise<void> => {
  try {
    getJwtSecret('TOKEN_SECRET');
    getJwtSecret('REFRESH_TOKEN_SECRET');
    await connectToMongo();
    app.get('/*', (req, res) => {
      res.sendFile(pathJoin(publicDir, 'index.html'));
    });

    const server = http.createServer(app);
    startChannelSocketServer(server);

    server.listen(app.get('port'), () => {
      console.log(`Display Networks listening on port ${app.get('port')}`);
    });
  } catch (err) {
    console.error(err);
  }
};

if (process.env.NODE_ENV !== 'test') {
  main();
}

export default app;

