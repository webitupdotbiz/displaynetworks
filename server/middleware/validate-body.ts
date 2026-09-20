export class BodyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BodyValidationError';
  }
}

export const requireBodyObject = (body: unknown): Record<string, unknown> => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BodyValidationError('Request body must be a JSON object');
  }

  return body as Record<string, unknown>;
};

export const copyAllowedFields = (
  body: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      result[field] = body[field];
    }
  }
  return result;
};

export const validateOptionalString = (
  body: Record<string, unknown>,
  field: string,
  maxLength = 10000
): void => {
  if (body[field] !== undefined && typeof body[field] !== 'string') {
    throw new BodyValidationError(`${field} must be a string`);
  }
  if (typeof body[field] === 'string' && body[field].length > maxLength) {
    throw new BodyValidationError(`${field} is too long`);
  }
};

export const validateOptionalNullableString = (
  body: Record<string, unknown>,
  field: string,
  maxLength = 10000
): void => {
  if (body[field] !== null) {
    validateOptionalString(body, field, maxLength);
  }
};

export const validateOptionalStringArray = (
  body: Record<string, unknown>,
  field: string
): void => {
  if (body[field] !== undefined &&
      (!Array.isArray(body[field]) || body[field].some((value) => typeof value !== 'string'))) {
    throw new BodyValidationError(`${field} must be an array of strings`);
  }
};

export const createSearchRegex = (value: unknown, maxLength = 100): RegExp | undefined => {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new BodyValidationError('term must be a string');
  }
  if (value.length > maxLength) {
    throw new BodyValidationError('term is too long');
  }

  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
};

export const validateEmail = (value: unknown, field = 'email'): string => {
  if (typeof value !== 'string' || value.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new BodyValidationError(`${field} must be a valid email address`);
  }
  return value;
};

export const validateOrigin = (value: unknown, field = 'origin'): string => {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new BodyValidationError(`${field} must be a valid origin`);
  }

  try {
    const origin = new URL(value);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' && origin.pathname !== '') {
      throw new Error();
    }
    return origin.origin;
  } catch {
    throw new BodyValidationError(`${field} must be a valid origin`);
  }
};

export const validateOptionalBoolean = (
  body: Record<string, unknown>,
  field: string
): void => {
  if (body[field] !== undefined && typeof body[field] !== 'boolean') {
    throw new BodyValidationError(`${field} must be a boolean`);
  }
};
