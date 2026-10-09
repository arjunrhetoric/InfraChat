import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InfraChat — realtime communication with authority built in",
  description: "Role-governed realtime messaging for engineering teams. Commands, moderation, and a complete audit trail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ background: "#090B0E" }}>{children}</body>
    </html>
  );
}
