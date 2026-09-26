import { createHash, randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/user.js';
import BaseCtrl from './base.js';
import sendEmail from '../services/emailService.js';
import { notifyUserStatusChanged } from '../services/channel.socket.js';
import { getAccessTokenTtlSeconds, getRefreshTokenTtlSeconds, getJwtSecret, signToken } from '../middleware/utils/jwt.js';
import {
  copyAllowedFields,
  createSearchRegex,
  requireBodyObject,
  validateEmail,
  validateOptionalString,
  validateOptionalStringArray,
  validateOrigin
} from '../middleware/validate-body.js';

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 10);
};

export const hashResetToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};

interface UserJwtPayload extends JwtPayload {
  user?: {
    id?: string;
    role?: string;
    email?: string;
  };
}

function isUserJwtPayload(decoded: unknown): decoded is UserJwtPayload {
  if (typeof decoded !== 'object' || decoded === null) {
    return false;
  }
  
  const payload = decoded as Record<string, unknown>;
  if (typeof payload['user'] !== 'object' || payload['user'] === null) {
    return false;
  }

  const user = payload['user'] as Record<string, unknown>;
  return (
    typeof user['id'] === 'string' &&
    typeof user['role'] === 'string' &&
    typeof user['email'] === 'string'
  );
}

export default class UserCtrl extends BaseCtrl<IUser> {
  model = User;

  override update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = requireBodyObject(req.body);
      validateOptionalString(body, 'email');
      validateOptionalString(body, 'search');
      validateOptionalString(body, 'notes');
      validateOptionalStringArray(body, 'tags');
      const payload = copyAllowedFields(body, ['email', 'search', 'tags', 'notes']);
      await this.model.findOneAndUpdate({ _id: req.params.id }, payload);
      return res.status(200).json({ message: 'OK' });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

  override getAll = async (req: Request, res: Response): Promise<Response> => {
    try {
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.header('Expires', '-1');
      res.header('Pragma', 'no-cache');
      const params: Record<string, unknown> = {};
      const result: { count?: number; users?: IUser[] } = {};
      const searchRegex = createSearchRegex(req.query.term);
      if (searchRegex) params.search = searchRegex;
      params.role = req?.user?.role === 'admin' ? 'groupadmin' : req?.user?.id;
      
      const count = await this.model.countDocuments(params);
      result.count = count;
      if (req.params.last) {
        params._id = { $lt: req.params.last };
      }
      const docs = await this.model.find(params).limit(15).sort({ updatedAt: -1 });
      result.users = docs;
      return res.status(200).json(result);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };

login = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = requireBodyObject(req.body);
      const { email, password } = body;
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        return res.sendStatus(403);
      }
      validateEmail(email);

      // Trim secrets to sanitize whitespace or carriage returns from env loading
      const envSecretToken = getJwtSecret('TOKEN_SECRET')?.trim();
      const refreshSecretToken = getJwtSecret('REFRESH_TOKEN_SECRET')?.trim();
      if (!envSecretToken || !refreshSecretToken) {
        return res.status(500).json({ error: 'JWT secrets misconfigured' });
      }

      const user = await this.model.findOne({ email }).exec();
      if (!user || !user.password) {
        return res.sendStatus(403);
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.sendStatus(403);
      }

      const userIdStr = user._id.toString();

      if (!user.active) {
        await this.model.findOneAndUpdate({ _id: user._id }, { active: true }).exec();
        notifyUserStatusChanged(userIdStr, true);
      }

      const basePayload = { id: userIdStr, role: user.role, email: user.email };

      // Pass cloned payload objects to prevent exp claim mutation across calls
      const accessToken = signToken(
        { user: { ...basePayload } },
        envSecretToken,
        getAccessTokenTtlSeconds()
      );
      const refreshToken = signToken(
        { user: { ...basePayload } },
        refreshSecretToken,
        getRefreshTokenTtlSeconds()
      );

      return res.status(200).json({ accessToken, refreshToken });
    } catch (err) {
      console.log('Login runtime error:', err);
      return res.sendStatus(500);
    }
  };

refresh = async (req: Request, res: Response): Promise<Response> => {
    try {
      const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
      const secret = getJwtSecret('REFRESH_TOKEN_SECRET')?.trim();

      if (!refreshToken || !secret) {
        return res.status(401).json({ error: 'Missing or invalid refresh token' });
      }

      const decoded = jwt.verify(refreshToken, secret);

      if (!isUserJwtPayload(decoded) || !decoded.user?.id) {
        return res.status(401).json({ error: 'Invalid refresh token payload' });
      }
      const userId = decoded.user.id;

      const user = await this.model.findById(userId).exec();
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const userIdStr = user._id.toString();
      const basePayload = { id: userIdStr, role: user.role, email: user.email };

      const accessToken = signToken(
        { user: { ...basePayload } },
        getJwtSecret('TOKEN_SECRET')?.trim() ?? '',
        getAccessTokenTtlSeconds()
      );
      const nextRefreshToken = signToken(
        { user: { ...basePayload } },
        secret,
        getRefreshTokenTtlSeconds()
      );

      return res.status(200).json({ accessToken, refreshToken: nextRefreshToken });
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.error(`Refresh token verification failed: ${errorName}`);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  };

  sendResetEmail = (origin: string, email: string, token: string): void => {
    const mailOptions = {
      from: `"${process.env.SEND_EMAIL_NAME}" <${process.env.SEND_EMAIL_ADDRESS}>`,
      to: email,
      subject: 'Account Password Reset',
      text: `You are receiving this email because you (or someone else) requested a password reset for this account.\n\nPlease click the link below or paste it into your browser to complete this process\n\n<${origin}/_reset/${token}>\n\nIf you did not request this, please ignore this email and your password will remain unchanged.`,
      html: `<h2>Password Reset</h2>You are receiving this email because you (or someone else) requested a password reset for this account.<br><br>Please click the link below or paste it into your browser to complete this process<br><br><a href="${origin}/_reset/${token}">${origin}/_reset/${token}</a><br><br>If you did not request this, please ignore this email and your password will remain unchanged.`
    };

    sendEmail(mailOptions);
  };

  sendInviteEmail = (admin: boolean, origin: string, email: string, token: string): void => {
    const appName = 'Display Networks';
    const msg = admin
      ? `You have been invited to be a ${appName} Group Admin.`
      : `You been invited to be a ${appName} Group Member.`;
    const subject = admin ? 'Group Admin Invitation' : 'Group Member Invitation';

    const mailOptions = {
      from: `"${process.env.SEND_EMAIL_NAME}" <${process.env.SEND_EMAIL_ADDRESS}>`,
      to: email,
      subject,
      text: `${msg}\n\nPlease click the link below or paste it into your browser to accept and complete the process\n\n<${origin}/_reset/${token}>`,
      html: `<h2>${appName} Invitation</h2>${msg}<br><br>Please click the link below or paste it into your browser to accept and complete the process<br><br><a href="${origin}/_reset/${token}">${origin}/_reset/${token}</a>`
    };

    sendEmail(mailOptions);
  };

  sendInvite = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = requireBodyObject(req.body);
      const recipientId = typeof body.userId === 'string' ? body.userId : '';
      const origin = typeof body.origin === 'string' ? body.origin : '';
      const senderRole = typeof req.user?.role === 'string' ? req.user.role : '';

      if (!recipientId) {
        return res.status(400).json({ error: 'Missing recipient userId' });
      }
      if (origin) validateOrigin(origin);

      const recipient = await this.model.findById(recipientId).exec();
      if (!recipient) {
        return res.status(404).json({ error: 'Recipient user not found' });
      }

      const token = await new Promise<string>((resolve, reject) => {
        randomBytes(20, (err, buf) => {
          if (err) return reject(err);
          resolve(buf.toString('hex'));
        });
      });

      const hashedPassword = await hashPassword(token);
      const hashedToken = hashResetToken(token);
      await this.model.findOneAndUpdate(
        { _id: recipientId },
        {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: Date.now() + 365 * 24 * 60 * 60 * 1000,
          password: hashedPassword,
          active: false,
        }
      ).exec();

      this.sendInviteEmail(senderRole === 'admin', origin, recipient.email, token);
      return res.status(200).json({ success: true, email: recipient.email });
    } catch {
      return res.status(500).json({ error: 'Failed to resend invite' });
    }
  };

  reset = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = requireBodyObject(req.body);
      if (typeof body.email !== 'string' || !body.email) {
        return res.sendStatus(403);
      }
      validateEmail(body.email);
      if (body.origin !== undefined) validateOrigin(body.origin);
      const user = await this.model.findOne({ email: body.email }).exec();
      if (!user) {
        return res.sendStatus(403);
      }

      const token = await new Promise<string>((resolve, reject) => {
        randomBytes(20, (err, buf) => {
          if (err) return reject(err);
          resolve(buf.toString('hex'));
        });
      });

      user.resetPasswordToken = hashResetToken(token);
      user.resetPasswordExpires = Date.now() + 24 * 60 * 60 * 1000;

      await this.model.findOneAndUpdate({ _id: user._id }, user).exec();

      this.sendResetEmail(typeof body.origin === 'string' ? body.origin : '', body.email, token);
      return res.status(200).json({});
    } catch {
      return res.sendStatus(500);
    }
  };

  doReset = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = requireBodyObject(req.body);
      const { password } = body;
      const { token } = req.params;

      if (typeof password !== 'string' || !password) {
        return res.sendStatus(400);
      }

      const user = await this.model.findOne({
        resetPasswordToken: hashResetToken(token),
        resetPasswordExpires: { $gt: Date.now() }
      }).exec();

      if (!user) {
        return res.sendStatus(400);
      }

      const hashedPassword = await hashPassword(password);
      const userIdStr = user._id.toString();

      await this.model.findOneAndUpdate(
        { _id: user._id },
        {
          password: hashedPassword,
          resetPasswordToken: '',
          resetPasswordExpires: undefined,
          active: true,
        }
      ).exec();

      notifyUserStatusChanged(userIdStr, true);

      const updatedUser = await this.model.findById(user._id).lean().exec();
      if (!updatedUser) {
        return res.sendStatus(500);
      }

      const { password: _password, ...sanitizedUser } = updatedUser;
      return res.status(200).json(sanitizedUser);
    } catch {
      return res.sendStatus(500);
    }
  };

  showReset = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = await this.model.findOne({
        resetPasswordToken: hashResetToken(req.params.token),
        resetPasswordExpires: { $gt: Date.now() }
      }).exec();

      if (!user) {
        return res.sendStatus(400);
      }

      return res.status(200).json(user);
    } catch {
      return res.sendStatus(500);
    }
  };

private sanitizeInsert = (req: Request, hashpass: string, token: string) => {
    const data = req.body?.data;
    if (!data) {
      throw new Error('Missing request data payload');
    }
    const { email, search, tags, notes } = data;
    const roledata = req?.user?.role;
    const userId = typeof req?.user?.id === 'string' ? req.user.id : '';
    if (typeof roledata !== 'string') {
      throw new Error('Invalid Role parameter');
    }
    if (typeof email !== 'string') {
      throw new Error('Invalid Email parameter');
    }
    validateEmail(email);
    if (tags !== undefined && !Array.isArray(tags)) {
      throw new Error('Invalid tags parameter');
    }
    if (search !== undefined && search !== null && typeof search !== 'string') {
      throw new Error('Invalid Search parameter');
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      throw new Error('Invalid Notes parameter');
    }
    const normalizedTags = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
    const role = roledata === 'admin' ? 'groupadmin' : userId;
    const resetPasswordExpires = Date.now() + 365 * 24 * 60 * 60 * 1000;

    return {
      email,
      search,
      tags: normalizedTags,
      notes: typeof notes === 'string' ? notes : '',
      role,
      password: hashpass,
      resetPasswordToken: hashResetToken(token),
      resetPasswordExpires,
      active: false
    };
  };

  override insert = async (req: Request, res: Response): Promise<Response> => {
    try {
      const token = await new Promise<string>((resolve, reject) => {
        randomBytes(20, (err, buf) => {
          if (err) return reject(err);
          resolve(buf.toString('hex'));
        });
      });
      const hashedPassword = await hashPassword(token);
      const origin = req.body?.origin;
      if (origin && typeof origin !== 'string') {
        throw new Error('Invalid Origin parameter');
      }
      if (origin) validateOrigin(origin);
      const sanitizedData = this.sanitizeInsert(req, hashedPassword, token);
      const obj = await new this.model(sanitizedData).save();
      this.sendInviteEmail(req.user?.role === 'admin', origin, req.body.data.email, token);

      return res.status(201).json(obj);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An unknown error occurred';
      return res.status(400).json({ error });
    }
  };
}
