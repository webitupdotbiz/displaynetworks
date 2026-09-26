declare module 'nodemailer' {
  interface SentMessageInfo {
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
    pending?: string[];
    response?: string;
    envelope?: Record<string, unknown>;
  }

  interface Transporter {
    sendMail(mailOptions: Record<string, unknown>): Promise<SentMessageInfo>;
  }

  function createTransport(options: Record<string, unknown>): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}
