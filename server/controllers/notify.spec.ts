import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response } from 'express';

const mockSendEmail = jest.fn();

jest.unstable_mockModule('../services/emailService.js', () => ({
  __esModule: true,
  default: mockSendEmail
}));

const { default: NotifyCtrl } = await import('./notify.js');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

const createResponse = (): MockResponse => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
} as unknown as MockResponse);

const createRequest = (body: any = {}) => ({
  body
} as unknown as Request);

describe('NotifyCtrl', () => {
  let controller: NotifyCtrl;

  beforeEach(() => {
    controller = new NotifyCtrl();
  });

  it('returns 400 when required fields are missing', async () => {
    const req = createRequest({ recipient: 'a@b.com' });
    const res = createResponse();

    await controller.sendNotification(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'recipient, subject, and message are required' });
  });

  it('sends notification and returns 200', async () => {
    const req = createRequest({ recipient: 'a@b.com', subject: 'Hi', message: 'Hello' });
    const res = createResponse();

    await controller.sendNotification(req, res);

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com', subject: 'Hi', text: 'Hello' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'Notification sent' });
  });

  it('returns 500 when sendEmail throws', async () => {
    mockSendEmail.mockImplementationOnce(() => { throw new Error('boom'); });
    const req = createRequest({ recipient: 'a@b.com', subject: 'Hi', message: 'Hello' });
    const res = createResponse();

    await controller.sendNotification(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'boom' });
  });
});
