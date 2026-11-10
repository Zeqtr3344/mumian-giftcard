import type { Metadata } from 'next';

// Home-screen app for the floor: "MuMian Staff" with the 木棉 logo icon.
export const metadata: Metadata = {
  title: { absolute: 'MuMian Staff' },
  robots: { index: false, follow: false },
  manifest: '/staff.webmanifest',
  appleWebApp: { title: 'MuMian Staff', capable: true, statusBarStyle: 'black' },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
