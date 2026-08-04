import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Убежище — Карточная игра',
  description: 'Психологическая игра на выживание',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="bg-zinc-950 text-zinc-100 antialiased selection:bg-emerald-500 selection:text-zinc-950">
        {children}
      </body>
    </html>
  );
}
