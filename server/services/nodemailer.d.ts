declare module 'nodemailer' {
  interface Transporter {
    sendMail(mailOptions: Record<string, unknown>): Promise<any>;
  }

  function createTransport(options: any): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}