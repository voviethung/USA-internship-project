import type { Metadata, Viewport } from 'next';
import AuthProvider from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import BottomNav from '@/components/BottomNav';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { UserRole } from '@/lib/types';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pharma Voice Assistant',
  description:
    'PWA voice assistant for pharmaceutical interns — speech-to-text, translation, and smart replies',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pharma AI',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2563eb',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialRole: UserRole = 'student';

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role) {
      initialRole = profile.role as UserRole;
    }
  }

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className="bg-blue-50 text-slate-800 antialiased">
        <AuthProvider initialUser={user} initialRole={initialRole}>
          <ToastProvider>
            {children}
            <BottomNav />
          </ToastProvider>
        </AuthProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

/** Register service worker on mount (client-only) */
function ServiceWorkerRegistrar() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker
                .register('/sw.js', { updateViaCache: 'none' })
                .then(function(registration) {
                  registration.update();
                })
                .catch(function(error) {
                  console.error('Service worker registration failed:', error);
                });
            });
          }
        `,
      }}
    />
  );
}
