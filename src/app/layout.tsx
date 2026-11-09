import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Gift Cards · MuMian Dining', template: '%s · MuMian Dining' },
  description: 'Buy a MuMian Dining gift card for modern Cantonese dining at Darling Quarter, Darling Harbour, Sydney. Sent by email, valid for three years.',
  icons: { icon: '/icon.png' },
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
};

export const viewport: Viewport = { themeColor: '#F6EEEA', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;500;700&family=Noto+Sans+SC:wght@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
