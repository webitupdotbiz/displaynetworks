import jwt, { JwtPayload, VerifyErrors } from 'jsonwebtoken';

export interface JwtUserPayload extends JwtPayload {
  user: {
    id: string;
    role: string;
    email: string;
  };
}

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function getJwtSecret(envName: string): string {
  const rawValue = process.env[envName];
  if (typeof rawValue === 'string' && rawValue.trim() !== '') {
    return rawValue.trim();
  }
  throw new Error(`${envName} must be set to a non-empty value`);
}

export function getTokenTtlSeconds(envName: string, fallbackSeconds: number): number {
  const rawValue = process.env[envName];
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return fallbackSeconds;
  }

  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackSeconds;
  }

  return Math.floor(parsed);
}

export function getAccessTokenTtlSeconds(): number {
  return getTokenTtlSeconds('JWT_ACCESS_TOKEN_TTL', DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
}

export function getRefreshTokenTtlSeconds(): number {
  return getTokenTtlSeconds('JWT_REFRESH_TOKEN_TTL', DEFAULT_REFRESH_TOKEN_TTL_SECONDS);
}

export function signToken(payload: object, secret: string, expiresInSeconds: number): string {
  return jwt.sign({ ...payload }, secret, { expiresIn: expiresInSeconds });
}

export function verifyJwt(
  token: string,
  secret: string
): Promise<JwtUserPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err: VerifyErrors | null, decoded: unknown) => {
      if (err) {
        return reject(err);
      }
      resolve(decoded as JwtUserPayload);
    });
  });
}
