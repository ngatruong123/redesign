import type { Metadata } from "next";
import "./globals.css";
import ToastContainer from "@/components/Toast";
import { SessionProvider } from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "Design Variation Tool — AI-Powered POD Design Generator",
  description: "Upload a design, generate 10 AI style variations, and create product mockups automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionProvider>
          {children}
          <ToastContainer />
        </SessionProvider>
      </body>
    </html>
  );
}
