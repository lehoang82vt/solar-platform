/**
 * NTF-03: Zalo ZNS adapter for template messages.
 * Use ZALO_USE_MOCK=true for tests (no real API call).
 */
export interface ZaloZNSResult {
  success: boolean;
  message_id?: string;
  [key: string]: unknown;
}

export class ZaloZNSAdapter {
  async send(
    recipient: string,
    templateId: string,
    data: Record<string, unknown>
  ): Promise<ZaloZNSResult> {
    if (process.env.ZALO_USE_MOCK === 'true') {
      return { success: true, message_id: `mock-${Date.now()}` };
    }

    const response = await fetch(
      'https://business.openapi.zalo.me/message/template',
      {
        method: 'POST',
        headers: {
          access_token: process.env.ZALO_ACCESS_TOKEN ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: recipient,
          template_id: templateId,
          template_data: data,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Zalo ZNS failed: ${response.statusText}`);
    }

    return (await response.json()) as ZaloZNSResult;
  }
}
