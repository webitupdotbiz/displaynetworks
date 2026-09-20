import { RequestHandler } from 'express';
import { verifyJwt, getJwtSecret } from './utils/jwt.js';

export const authMiddleware: RequestHandler = async (req, res, next) => {
  const token =
    (req.body?.token as string) ||
    (req.query.token as string) ||
    (req.headers['x-access-token'] as string);
  if (!token) {
    return res.status(403).json({ success: false, message: 'No token provided.' });
  }

  try {
    const decoded = await verifyJwt(token, getJwtSecret('TOKEN_SECRET'));
    const { id, role } = decoded.user;

    if (role) {
      req.user = { id, role };
      return next();
    }

    return res.status(401);
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Failed to authenticate token.' });
  }
};
