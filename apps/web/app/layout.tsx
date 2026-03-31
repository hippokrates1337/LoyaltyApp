import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LoyaltyApp — Reviews & Social Proof',
  description: 'Collect and display verified product reviews for your Shopware store.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
