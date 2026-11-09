import QRCode from 'qrcode';
import { cardByToken, cardUrl } from '@/lib/cards';

export const runtime = 'nodejs';

// PNG QR code of the card number, used in emails and on the card page.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const card = await cardByToken((await params).token);
  if (!card) return new Response('Not found', { status: 404 });
  const png = await QRCode.toBuffer(cardUrl(card), { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#231F20', light: '#FFFFFF' } });
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' } });
}
