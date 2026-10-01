import type { Metadata } from "next";
import { Exo_2, JetBrains_Mono } from "next/font/google";
import { SessionReplayRecorder } from "@/components/SessionReplayRecorder";
import "./globals.css";

const inter = Exo_2({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AeroLease Ledger",
  description: "Aircraft lease utilization extraction and evidence records",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionReplayRecorder />
        {children}
      </body>
    </html>
  );
}
