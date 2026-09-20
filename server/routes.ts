import express, { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from './middleware/auth.js';

import ChannelCtrl from './controllers/channel.js';
import UserCtrl from './controllers/user.js';
import NotifyCtrl from './controllers/notify.js';
import RuleCtrl from './controllers/rule.js';

export default function setRoutes(app: Application): void {
  const router = express.Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  });
  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  });

  const channelCtrl = new ChannelCtrl();
  const userCtrl = new UserCtrl();
  const notifyCtrl = new NotifyCtrl();
  const ruleCtrl = new RuleCtrl();

  // Public routes
  router.post('/login', authLimiter, userCtrl.login);
  router.post('/refresh', refreshLimiter, userCtrl.refresh);
  router.post('/user/reset', authLimiter, userCtrl.reset);
  router.get('/reset/:token', authLimiter, userCtrl.showReset);
  router.post('/reset/:token', authLimiter, userCtrl.doReset);

  router.get('/channel/:name', channelCtrl.getByNameApplyRules);

  // Protected routes
  router.use(authMiddleware);

  // Notify
  router.post('/notify', notifyCtrl.sendNotification);

  // Channels
  router.get('/channels/count', channelCtrl.count);
  router.post('/channels', channelCtrl.insert);
  router.get('/channels/:id', channelCtrl.get);
  router.put('/channels/:id', channelCtrl.update);
  router.delete('/channels/:id', channelCtrl.delete);
  router.get('/channels/check/:name', channelCtrl.checkNameAvailable);

  // Users
  router.post('/user', userCtrl.insert);
  router.post('/user/invite', userCtrl.sendInvite);
  router.get('/users', userCtrl.getAll);
  router.get('/users/:last', userCtrl.getAll);
  router.get('/users/count', userCtrl.count);
  router.get('/user/:id', userCtrl.get);
  router.put('/user/:id', userCtrl.update);
  router.delete('/user/:id', userCtrl.delete);

  // Channels under user
  router.get('/user/:id/channels', channelCtrl.getAll);
  router.get('/user/:id/channels/:last', channelCtrl.getAll);
  router.get('/user/:id/channels/count', channelCtrl.count);

  // Rules for users
  router.post('/user/:id/rule', ruleCtrl.insert);
  router.get('/user/:id/rule/:ruleId', ruleCtrl.get);
  router.get('/user/:id/rules', ruleCtrl.getOrderedRules);
  router.get('/user/:id/rules/:last', ruleCtrl.getOrderedRules);
  router.get('/user/:id/rules/count', ruleCtrl.count);
  router.put('/user/:id/rule/:ruleId', ruleCtrl.update);
  router.delete('/user/:id/rule/:ruleId', ruleCtrl.delete);
  router.post('/user/:id/rules/swap', ruleCtrl.swapPriority);

  // Get the tags this specific user's channels
  router.get('/user/:id/tags/selector', ruleCtrl.getDropdownTags);

  app.use('/_api', router);
}
