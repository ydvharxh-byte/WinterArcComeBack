import { AppShell } from "@/components/app-shell";
import { getShellData } from "@/server/meta";
import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Study OS",
  description: "One dashboard for study, planner, tasks, exams, fitness, nutrition and the Winter Arc.",
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const shell = await getShellData();
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body
        className="antialiased"
        style={{ "--accent": shell.settings.accent } as CSSProperties}
      >
        <AppShell data={shell}>{children}</AppShell>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#16233A",
              border: "1px solid #243247",
              color: "#F8FAFC",
            },
          }}
        />
      </body>
    </html>
  );
}
