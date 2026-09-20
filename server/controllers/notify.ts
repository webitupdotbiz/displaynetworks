import { Request, Response } from 'express';
import sendEmail from '../services/emailService.js';
import { requireBodyObject, validateEmail, validateOptionalString } from '../middleware/validate-body.js';

export default class NotifyCtrl {
  sendNotification = async (req: Request, res: Response) => {
    try {
      const { recipient, subject, message } = requireBodyObject(req.body);

      if (typeof recipient !== 'string' || typeof subject !== 'string' || typeof message !== 'string' ||
          !recipient || !subject || !message) {
        return res.status(400).json({
          error: 'recipient, subject, and message are required'
        });
      }
      validateEmail(recipient, 'recipient');
      validateOptionalString({ subject }, 'subject', 200);
      validateOptionalString({ message }, 'message', 100000);

      const mailOptions = {
        from: `"${process.env.SEND_EMAIL_NAME}" <${process.env.SEND_EMAIL_ADDRESS}>`,
        to: recipient,
        subject,
        text: message
      };

      sendEmail(mailOptions);

      return res.status(200).json({ status: 'Notification sent' });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unable to send notification';
      return res.status(500).json({ error });
    }
  };
}
