import PDFDocument from 'pdfkit';
import { getQuote } from './quote-update';

/**
 * Generate quote PDF (customer-facing).
 * No cost prices, no margins - only selling prices.
 */
export async function generateQuotePDF(
  organizationId: string,
  quoteId: string
): Promise<Buffer> {
  const quote = await getQuote(organizationId, quoteId);

  if (!['APPROVED', 'SENT', 'CUSTOMER_ACCEPTED'].includes(quote.status as string)) {
    throw new Error('Only approved quotes can be exported to PDF');
  }

  const doc = new PDFDocument({ margin: 50 });
  const buffers: Buffer[] = [];

  doc.on('data', buffers.push.bind(buffers));

  doc.fontSize(20).text('QUOTE', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Quote Number: ${quote.quote_number}`);
  doc.text(`Date: ${new Date(quote.created_at as string).toLocaleDateString('vi-VN')}`);
  doc.text(`Valid Until: ${new Date(quote.valid_until as string).toLocaleDateString('vi-VN')}`);
  doc.moveDown();

  doc.fontSize(14).text('Customer Information');
  doc.fontSize(10);
  if (quote.customer_name) doc.text(`Name: ${quote.customer_name}`);
  if (quote.customer_phone) doc.text(`Phone: ${quote.customer_phone}`);
  if (quote.customer_email) doc.text(`Email: ${quote.customer_email}`);
  if (quote.customer_address) doc.text(`Address: ${quote.customer_address}`);
  doc.moveDown();

  doc.fontSize(14).text('System Information');
  doc.fontSize(10);
  doc.text(`System Size: ${quote.system_size_kwp} kWp`);
  doc.text(`Panel Count: ${quote.panel_count} panels`);
  doc.moveDown();

  doc.fontSize(14).text('Quote Items');
  doc.moveDown(0.5);

  const tableTop = doc.y;
  const itemX = 50;
  const qtyX = 300;
  const unitX = 350;
  const priceX = 400;
  const totalX = 480;

  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Description', itemX, tableTop);
  doc.text('Qty', qtyX, tableTop);
  doc.text('Unit', unitX, tableTop);
  doc.text('Price (VND)', priceX, tableTop, { width: 70, align: 'right' });
  doc.text('Total (VND)', totalX, tableTop, { width: 70, align: 'right' });

  doc.moveDown();
  doc.font('Helvetica');

  const lineItems = (quote.line_items || []) as Array<Record<string, unknown>>;
  let y = doc.y;

  for (const item of lineItems) {
    doc.text(String(item.description ?? ''), itemX, y, { width: 240 });
    doc.text(String(item.quantity ?? ''), qtyX, y);
    doc.text(String(item.unit ?? ''), unitX, y);
    const unitPrice = new Intl.NumberFormat('vi-VN').format(Number(item.unit_price_vnd ?? 0));
    doc.text(unitPrice, priceX, y, { width: 70, align: 'right' });
    const totalPrice = new Intl.NumberFormat('vi-VN').format(Number(item.total_price_vnd ?? 0));
    doc.text(totalPrice, totalX, y, { width: 70, align: 'right' });
    y += 20;
  }

  doc.y = y;
  doc.moveDown(2);

  doc.font('Helvetica-Bold');
  const subtotal = new Intl.NumberFormat('vi-VN').format(Number(quote.subtotal_vnd ?? 0));
  doc.text(`Subtotal: ${subtotal} VND`, { align: 'right' });

  const discountVnd = Number(quote.discount_vnd ?? 0);
  if (discountVnd > 0) {
    const discount = new Intl.NumberFormat('vi-VN').format(discountVnd);
    doc.text(`Discount: -${discount} VND`, { align: 'right' });
  }

  const taxVnd = Number(quote.tax_vnd ?? 0);
  if (taxVnd > 0) {
    const tax = new Intl.NumberFormat('vi-VN').format(taxVnd);
    doc.text(`Tax: ${tax} VND`, { align: 'right' });
  }

  const total = new Intl.NumberFormat('vi-VN').format(Number(quote.total_vnd ?? 0));
  doc.fontSize(14).text(`Total: ${total} VND`, { align: 'right' });

  doc.moveDown(2);

  if (quote.notes) {
    doc.font('Helvetica').fontSize(10);
    doc.text('Notes:', { underline: true });
    doc.text(String(quote.notes));
  }

  doc.moveDown(2);
  doc.fontSize(8).text('This is a computer-generated quote.', { align: 'center' });

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', reject);
  });
}

/**
 * Check if PDF contains cost prices (should not in customer PDF)
 */
export function pdfContainsCostPrices(pdfBuffer: Buffer): boolean {
  const text = pdfBuffer.toString('latin1');
  const indicators = ['cost price', 'buy price', 'margin', 'profit'];
  return indicators.some((indicator) => text.toLowerCase().includes(indicator));
}

/**
 * Check if PDF contains margin info (should not in customer PDF)
 */
export function pdfContainsMargins(pdfBuffer: Buffer): boolean {
  const text = pdfBuffer.toString('latin1');
  const marginIndicators = ['gross margin', 'net margin'];
  return marginIndicators.some((indicator) => text.toLowerCase().includes(indicator));
}
