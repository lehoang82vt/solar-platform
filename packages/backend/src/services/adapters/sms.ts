/**
 * NTF-03: SMS adapter (e.g. Twilio, SMSAPI).
 * Use SMS_USE_MOCK=true for tests (no real API call).
 */
export interface SMSResult {
  success: boolean;
  message_id?: string;
  [key: string]: unknown;
}

export class SMSAdapter {
  async send(recipient: string, message: string): Promise<SMSResult> {
    if (process.env.SMS_USE_MOCK === 'true') {
      return { success: true, message_id: `sms-${Date.now()}` };
    }

    const url = process.env.SMS_API_URL;
    const key = process.env.SMS_API_KEY;
    if (!url || !key) {
      throw new Error('SMS_API_URL and SMS_API_KEY are required');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipient,
        message,
      }),
    });

    if (!response.ok) {
      throw new Error(`SMS failed: ${response.statusText}`);
    }

    return (await response.json()) as SMSResult;
  }
}
