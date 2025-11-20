import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "XMethod Backlog",
  description: "Генерация YAML бэклога без бэкенда",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="container">
          <header className="header">
            <h1>XMethod Backlog</h1>
          </header>
          <main>{children}</main>
          <footer className="footer">© {new Date().getFullYear()}</footer>
        </div>
      </body>
    </html>
  );
}
