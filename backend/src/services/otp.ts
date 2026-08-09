import { request } from 'undici';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * OTP delivery. In development OTP_PROVIDER=console just logs the code, so you
 * can sign in locally without an SMS account.
 */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const message = `${code} is your Zari verification code. It expires in 10 minutes.`;

  switch (env.OTP_PROVIDER) {
    case 'console':
      logger.info({ phone, code }, '[dev] OTP');
      return;

    case 'msg91': {
      if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) {
        logger.error('MSG91 selected but not configured');
        return;
      }
      await request('https://control.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: { authkey: env.MSG91_AUTH_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          template_id: env.MSG91_TEMPLATE_ID,
          mobile: phone.replace(/^\+/, ''),
          otp: code,
        }),
      });
      return;
    }

    case 'twilio': {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
        logger.error('Twilio selected but not configured');
        return;
      }
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString(
        'base64',
      );
      await request(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${auth}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: phone,
            From: env.TWILIO_FROM_NUMBER,
            Body: message,
          }).toString(),
        },
      );
      return;
    }
  }
}
