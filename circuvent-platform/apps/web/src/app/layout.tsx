import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Circuvent Technologies",
  description: "AI, IoT, Embedded Systems & Full-Stack Development — Internal Management Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('circuvent_theme');
                  var isDark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) document.documentElement.classList.add('dark');
                  else document.documentElement.classList.remove('dark');
                  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
                } catch(e) { document.documentElement.classList.add('dark'); }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 transition-colors duration-300">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
