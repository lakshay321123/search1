export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Wizkid</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen antialiased">
        <div className="max-w-4xl mx-auto p-6">{children}</div>
      </body>
    </html>
  );
}
