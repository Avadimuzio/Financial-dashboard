import "./globals.css";

export const metadata = {
  title: "The Ledger — AI Financial Analysis",
  description: "AI-powered financial statement analyzer, built by Ava DiMuzio",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
