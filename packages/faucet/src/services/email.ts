import sgMail from "@sendgrid/mail";

export class EmailService {
  constructor() {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error("SENDGRID_API_KEY environment variable is not set");
    }
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  async sendOTP(email: string, otpCode: string): Promise<void> {
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || "hello@cheqd.io";
    const templateId = process.env.SENDGRID_OTP_TEMPLATE_ID;

    if (!templateId) {
      throw new Error("SENDGRID_OTP_TEMPLATE_ID environment variable is not set");
    }

    try {
      await sgMail.send({
        to: email,
        from: fromEmail,
        templateId: templateId,
        dynamicTemplateData: {
          OTP_CODE: otpCode,
        },
      });
      console.info(`OTP email sent successfully to ${email}`);
    } catch (error) {
      console.error("Failed to send OTP email:", error);
      throw error;
    }
  }
}

export const emailService = new EmailService();

