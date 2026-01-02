// services/smsService.js
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

async function sendDockAssignment(phoneNumber, dockNumber, additionalInfo = {}) {
  try {
    const message = `
Hello! You've been assigned to Dock ${dockNumber}.
${additionalInfo.location ? `Location: ${additionalInfo.location}` : ''}
${additionalInfo.instructions ? `Instructions: ${additionalInfo.instructions}` : ''}
Please proceed to your assigned dock.
    `.trim();

    const result = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: phoneNumber
    });

    console.log('SMS sent successfully:', result.sid);
    return { success: true, messageId: result.sid };
  } catch (error) {
    console.error('SMS sending failed:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { sendDockAssignment };
