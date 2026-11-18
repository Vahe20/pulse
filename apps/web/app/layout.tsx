import "./global.scss";

import type { Metadata } from "next";

import { Providers } from "./providers";
export const metadata: Metadata = {
  title: "Pulse · Academy feedback",
  description: "Student surveys, feedback analysis and improvements",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
