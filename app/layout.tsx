import "./globals.css";

export const metadata = {
  title: "Mallan Real Estate Inc",
  description: "NYC search, new dev, building dossiers, and tools",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>{children}</body>
    </html>
  );
}
