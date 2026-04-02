/**
 * Vectra - Email Utility Functions
 */

const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'Vectra <noreply@pastquest.ng>';

/**
 * Send an email
 */
async function sendEmail({ to, subject, html, text }) {
  if (!resend) {
    console.warn('Email service not configured. Skipping email to:', to);
    return { success: true, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email to new user
 */
async function sendWelcomeEmail(email, displayName) {
  return sendEmail({
    to: email,
    subject: 'Welcome to Vectra!',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Vectra!</h1>
            </div>
            <div class="content">
              <p>Hi ${displayName || 'there'},</p>
              <p>Thank you for joining Vectra! We're excited to help you access quality past questions for your studies.</p>
              <p>Here's what you can do:</p>
              <ul>
                <li>Browse past questions by department and level</li>
                <li>Subscribe to get unlimited access</li>
                <li>Contribute past questions and earn money</li>
              </ul>
              <p>If you have any questions, don't hesitate to reach out.</p>
              <p>Happy studying!</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Vectra. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  });
}

/**
 * Send payment confirmation email
 */
async function sendPaymentConfirmation(email, subscription) {
  const expiryDate = new Date(subscription.expiry_date).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return sendEmail({
    to: email,
    subject: 'Payment Successful - Vectra',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Successful!</h1>
            </div>
            <div class="content">
              <p>Your payment has been confirmed. Here are your subscription details:</p>
              <div class="details">
                <p><strong>Type:</strong> ${subscription.type === 'level' ? 'Level Access' : 'Course Access'}</p>
                <p><strong>Department:</strong> ${subscription.department_id}</p>
                ${subscription.level ? `<p><strong>Level:</strong> ${subscription.level}</p>` : ''}
                ${subscription.course_code ? `<p><strong>Course:</strong> ${subscription.course_code}</p>` : ''}
                <p><strong>Amount:</strong> ₦${subscription.price.toLocaleString()}</p>
                <p><strong>Expires:</strong> ${expiryDate}</p>
              </div>
              <p>You now have full access to all past questions in your subscription. Happy studying!</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Vectra. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  });
}

/**
 * Send question approval notification
 */
async function sendQuestionApproved(email, { courseCode, points, earnings }) {
  return sendEmail({
    to: email,
    subject: 'Question Approved - You Earned! 🎉',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .earnings { background: #ECFDF5; border: 2px solid #10B981; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Question Approved!</h1>
            </div>
            <div class="content">
              <p>Great news! Your question for <strong>${courseCode}</strong> has been approved.</p>
              <div class="earnings">
                <p style="font-size: 24px; margin: 0;"><strong>+${points} Points</strong></p>
                <p style="font-size: 18px; color: #10B981; margin: 5px 0;">₦${earnings.toLocaleString()} earned!</p>
              </div>
              <p>Keep contributing quality past questions to earn more!</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Vectra. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  });
}

/**
 * Send question rejection notification
 */
async function sendQuestionRejected(email, { courseCode, reason }) {
  return sendEmail({
    to: email,
    subject: 'Question Not Approved - Vectra',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #EF4444; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .reason { background: #FEF2F2; border: 1px solid #EF4444; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Question Not Approved</h1>
            </div>
            <div class="content">
              <p>Unfortunately, your question for <strong>${courseCode}</strong> was not approved.</p>
              <div class="reason">
                <p><strong>Reason:</strong> ${reason}</p>
              </div>
              <p>Please review the feedback and try uploading again with the necessary corrections.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Vectra. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  });
}

/**
 * Send withdrawal processed notification
 */
async function sendWithdrawalProcessed(email, { amount, accountName, bankName }) {
  return sendEmail({
    to: email,
    subject: 'Withdrawal Processed - Vectra',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Withdrawal Processed!</h1>
            </div>
            <div class="content">
              <p>Your withdrawal has been processed successfully.</p>
              <div class="details">
                <p><strong>Amount:</strong> ₦${amount.toLocaleString()}</p>
                <p><strong>Account:</strong> ${accountName}</p>
                <p><strong>Bank:</strong> ${bankName}</p>
              </div>
              <p>The funds should reflect in your account within 1-3 business days.</p>
              <p>Thank you for contributing to Vectra!</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Vectra. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPaymentConfirmation,
  sendQuestionApproved,
  sendQuestionRejected,
  sendWithdrawalProcessed
};
