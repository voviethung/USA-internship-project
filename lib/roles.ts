import type { UserRole } from './types';

/** Route access rules by role */
const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/dashboard': ['admin', 'mentor'],
  '/students': ['admin', 'mentor'],
  '/mentors': ['admin'],
  '/resources': ['admin', 'mentor', 'student'],
  '/tasks': ['admin', 'mentor', 'student'],
  '/notifications': ['admin', 'mentor', 'student'],
  // Existing routes — all roles
  '/': ['admin', 'mentor', 'student'],
  '/history': ['admin', 'mentor', 'student'],
  '/profile': ['admin', 'mentor', 'student'],
};

/** Check if a role can access a given pathname */
export function canAccess(role: UserRole, pathname: string): boolean {
  // Find the matching route (longest prefix match)
  const route = Object.keys(ROUTE_PERMISSIONS)
    .filter((r) => pathname === r || pathname.startsWith(r + '/'))
    .sort((a, b) => b.length - a.length)[0];

  if (!route) return true; // Unknown route → allow (404 will handle)
  return ROUTE_PERMISSIONS[route].includes(role);
}

/** Role display labels */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  mentor: 'Mentor',
  student: 'Student',
};

/** Role badge colors */
export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  mentor: 'bg-blue-100 text-blue-700',
  student: 'bg-green-100 text-green-700',
};
