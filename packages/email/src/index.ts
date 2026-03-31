import * as postmark from 'postmark';

let client: postmark.ServerClient | null = null;

/**
 * Get the Postmark client singleton.
 * Requires POSTMARK_API_TOKEN environment variable.
 */
export function getEmailClient(): postmark.ServerClient {
  if (!client) {
    const token = process.env.POSTMARK_API_TOKEN;
    if (!token) {
      throw new Error('POSTMARK_API_TOKEN environment variable is not set');
    }
    client = new postmark.ServerClient(token);
  }
  return client;
}

/**
 * Send a review request email to a customer.
 */
export async function sendReviewRequestEmail(params: {
  to: string;
  customerName: string;
  productName: string;
  reviewUrl: string;
  shopUrl: string;
  locale: 'en' | 'de';
}): Promise<void> {
  const emailClient = getEmailClient();

  const subject =
    params.locale === 'de'
      ? `Wie war Ihre Erfahrung mit ${params.productName}?`
      : `How was your experience with ${params.productName}?`;

  // TODO: Replace with Postmark template IDs once templates are created
  await emailClient.sendEmail({
    From: `reviews@${new URL(params.shopUrl).hostname}`,
    To: params.to,
    Subject: subject,
    TextBody: getReviewRequestTextBody(params),
    MessageStream: 'outbound',
  });
}

function getReviewRequestTextBody(params: {
  customerName: string;
  productName: string;
  reviewUrl: string;
  shopUrl: string;
  locale: 'en' | 'de';
}): string {
  if (params.locale === 'de') {
    return [
      `Hallo ${params.customerName},`,
      '',
      `vielen Dank für Ihren Einkauf von ${params.productName}!`,
      'Wir würden uns über Ihre Bewertung freuen.',
      '',
      `Bewertung abgeben: ${params.reviewUrl}`,
      '',
      '---',
      `Um die Löschung Ihrer Daten zu beantragen, kontaktieren Sie bitte ${params.shopUrl}`,
    ].join('\n');
  }

  return [
    `Hi ${params.customerName},`,
    '',
    `Thank you for purchasing ${params.productName}!`,
    'We would love to hear about your experience.',
    '',
    `Leave a review: ${params.reviewUrl}`,
    '',
    '---',
    `To request deletion of your data, contact ${params.shopUrl}`,
  ].join('\n');
}
