export const metadata = {
  title: 'mallan.nyc',
  description: 'Mallan Real Estate — NYC search & insights',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
