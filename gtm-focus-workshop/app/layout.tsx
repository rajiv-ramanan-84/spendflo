import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GTM Focus Workshop',
  description: 'Evidence-backed GTM decision workshop for CRO-led teams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
