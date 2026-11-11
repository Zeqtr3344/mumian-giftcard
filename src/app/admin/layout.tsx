import type { Metadata } from 'next';

// Home-screen app for managers: "MuMian Admin" with the black and white icon,
// so it is easy to tell apart from the red "MuMian Staff" app.
export const metadata: Metadata = {
  title: { absolute: 'MuMian Admin' },
  robots: { index: false, follow: false },
  manifest: '/admin.webmanifest',
  icons: { icon: '/app-icon-admin-192.png', apple: '/apple-touch-icon-admin.png' },
  appleWebApp: { title: 'MuMian Admin', capable: true, statusBarStyle: 'black' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
