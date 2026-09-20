import nodemailer from 'nodemailer';

const sendEmail = (mailOptions: Record<string, unknown>) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SEND_EMAIL_HOST,
    port: process.env.SEND_EMAIL_PORT || undefined,
    secure: true,
    auth: {
      user: process.env.SEND_EMAIL_ADDRESS,
      pass: process.env.SEND_EMAIL_PASSWORD
    }
  });

  // Use setImmediate to send the email in a non-blocking way
  setImmediate(async () => {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Message sent:', info?.messageId ?? info);
    } catch (error) {
      console.log('sendEmail error:', error);
    }
  });
};

export default sendEmail;
