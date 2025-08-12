// Do NOT add 'use client' here.

export const metadata = {
  title: 'MAllan Real Estate — NYC',
  description: 'Mallan Real Estate — NYC search & insights',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
