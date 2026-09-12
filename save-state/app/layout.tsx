import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";
// Vendored RPGUI styles only (no RPGUI JavaScript — see Phase 7).
// Imported after globals so RPGUI theme rules keep their override order.
import "../styles/vendor/rpgui/rpgui.css";

const displayFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Save State",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body>{children}</body>
    </html>
  );
}
