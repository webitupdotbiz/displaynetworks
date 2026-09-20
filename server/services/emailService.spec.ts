import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn();

jest.unstable_mockModule('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: mockCreateTransport
  },
  createTransport: mockCreateTransport
}));

const nodemailer = (await import('nodemailer')).default;
const { default: sendEmail } = await import('./emailService.js');

describe('server/services/emailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    jest.useFakeTimers({ legacyFakeTimers: true });
    mockCreateTransport.mockImplementation(() => ({
      sendMail: mockSendMail
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  it('creates a transporter using environment configuration and sends mail', async () => {
    process.env.SEND_EMAIL_HOST = 'smtp.example.com';
    process.env.SEND_EMAIL_PORT = '465';
    process.env.SEND_EMAIL_ADDRESS = 'user@example.com';
    process.env.SEND_EMAIL_PASSWORD = 'secret';
    const messageInfo = { messageId: 'abc123' };
    mockSendMail.mockResolvedValueOnce(messageInfo);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    sendEmail({ to: 'test@domain.com', subject: 'Hello', text: 'Hi' });
    jest.runAllImmediates();
    await Promise.resolve();

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: '465',
      secure: true,
      auth: {
        user: 'user@example.com',
        pass: 'secret'
      }
    });
    expect(mockSendMail).toHaveBeenCalledWith({ to: 'test@domain.com', subject: 'Hello', text: 'Hi' });
    expect(consoleSpy).toHaveBeenCalledWith('Message sent:', 'abc123');

    consoleSpy.mockRestore();
  });

  it('does not throw when sendMail rejects', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('failed'));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    sendEmail({ to: 'fail@domain.com' });
    jest.runAllImmediates();
    await Promise.resolve();

    expect(mockSendMail).toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Message sent:'), expect.anything());
    consoleSpy.mockRestore();
  });
});
