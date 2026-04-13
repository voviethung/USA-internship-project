'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import type { UserRole } from '@/lib/types';

interface NavTab {
  href: string;
  label: string;
  icon: string;
  roles: UserRole[];
}

const tabs: NavTab[] = [
  { href: '/', label: 'Home', icon: '🎤', roles: ['admin', 'mentor', 'student'] },
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'mentor'] },
  { href: '/students', label: 'Students', icon: '🎓', roles: ['admin', 'mentor'] },
  { href: '/mentors', label: 'Mentors', icon: '👨‍🏫', roles: ['admin'] },
  { href: '/lectures', label: 'Lectures', icon: '📚', roles: ['admin', 'mentor', 'student'] },
  { href: '/tasks', label: 'Tasks', icon: '✅', roles: ['admin', 'mentor', 'student'] },
  { href: '/notifications', label: 'Alerts', icon: '🔔', roles: ['admin', 'mentor', 'student'] },
  { href: '/history', label: 'History', icon: '📋', roles: ['admin', 'mentor', 'student'] },
  { href: '/profile', label: 'Profile', icon: '👤', roles: ['admin', 'mentor', 'student'] },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user, role, loading } = useAuth();

  // Don't show nav on login page or while loading auth
  if (loading || pathname === '/login') return null;

  // Guest users see student-level tabs
  const effectiveRole: UserRole = user ? role : 'student';
  const visibleTabs = tabs.filter((t) => t.roles.includes(effectiveRole));

  // If too many tabs, show scrollable nav
  const needsScroll = visibleTabs.length > 5;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm safe-bottom">
      <div
        className={`mx-auto flex max-w-lg items-center ${
          needsScroll ? 'overflow-x-auto scrollbar-hide gap-0' : 'justify-around'
        }`}
      >
        {visibleTabs.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                needsScroll ? 'min-w-[4rem] flex-shrink-0 px-1' : 'flex-1'
              } ${
                isActive
                  ? 'text-primary-600 font-semibold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
