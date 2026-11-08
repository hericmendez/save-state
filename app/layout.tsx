import type { Metadata } from "next";
import { JetBrains_Mono, Press_Start_2P, Roboto } from "next/font/google";
import "./globals.css";
// Vendored RPGUI styles (Phase 1).
// Phase 4: the vendored RPGUI *runtime* (public/vendor/rpgui/rpgui.js) is no
// longer loaded. Audit proved zero functional use: nothing calls
// RPGUI.init/create/update, no component depends on its DOM transforms, and
// its global init was already disabled by guard. Buttons, selects, dropdowns,
// drawers and keyboard navigation are native React/DOM. The file is preserved
// on disk as a reference; see docs/FRONTEND_PERFORMANCE_PHASE_4_REPORT.md.
import "../styles/vendor/rpgui/rpgui.css";
import { LAYOUT_INIT_SCRIPT } from "@/features/shared/layout-mode";

const displayFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-body",
});

// Roboto (400/500/700: `font-bold` is used in activity, cards and table
// rows) for the optional title/body preferences. Same mechanism
// (next/font + CSS variable), no extra dependency.
const robotoFont = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "Save State",
  description:
    "Save State — registre, organize e acompanhe sua coleção de jogos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${robotoFont.variable}`}>
      <head>
        {/*
          Parser-blocking preference init: sets html[data-layout-mode]
          plus html[data-font-display]/html[data-font-body] before first
          paint (stored values, current defaults). Must stay a raw sync
          script — deferred/async strategies paint first and would
          reintroduce the flash this removes.
        */}
        <script dangerouslySetInnerHTML={{ __html: LAYOUT_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
