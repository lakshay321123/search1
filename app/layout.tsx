export const metadata = { title: 'Wizkid', description: 'Google-like AI search (no ads)' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={bodyStyle as any}>{children}</body>
    </html>
  );
}

const bodyStyle = {
  margin: 0,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  background: '#0b0d10',
  color: 'white'
};
