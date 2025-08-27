// @ts-nocheck
import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Mallan Real Estate Inc — NYC',
  description: 'Mallan Real Estate — NYC search & insights',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
