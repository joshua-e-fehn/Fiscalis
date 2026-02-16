import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { ConvexClientProvider } from "@/components/ConvexClientProvider";

import "./globals.css";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fiscalis",
  description: "Have a look at your financial future!",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dynamic` is required for strict CSP — the nonce is generated server-side
    // and must be passed to the client via dynamic rendering.
    // In dev mode strict CSP is disabled (see proxy.ts), but `dynamic` is harmless to keep.
    <ClerkProvider dynamic>
      <html lang="en">
        <body className={inter.className}>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
