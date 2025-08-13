// app/layout.tsx
export const metadata = {
  title: 'Mallan Real Estate — NYC search & insights',
  description: 'mallan.nyc',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
