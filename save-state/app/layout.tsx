import type { Metadata } from "next";
import { JetBrains_Mono, Press_Start_2P } from "next/font/google";
import Script from "next/script";
import "./globals.css";
// Vendored RPGUI styles (Phase 1). The runtime loads via RpguiInitializer;
// its automatic global init is disabled (see features/rpgui/guard.ts).
import "../styles/vendor/rpgui/rpgui.css";
import { RpguiInitializer } from "@/features/rpgui/rpgui-initializer";

const displayFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-body",
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
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        {children}
        {/*
          Installed before any page script runs. The vendored runtime
          replaces window.RPGUI on evaluation and re-enables its own
          auto-init, so this listener (registered first, therefore run
          first at the window target) re-asserts the opt-out when load
          fires. The initializer below re-asserts it again on script load.
        */}
        <Script
          id="rpgui-load-guard"
          strategy="beforeInteractive"
        >{`window.RPGUI=window.RPGUI||{};window.RPGUI.init_on_load=false;window.addEventListener("load",function(){window.RPGUI.init_on_load=false;});`}</Script>
        <RpguiInitializer />
      </body>
    </html>
  );
}
