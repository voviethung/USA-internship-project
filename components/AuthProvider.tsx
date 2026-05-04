'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createSupabaseBrowser } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: 'student',
  loading: true,
  signOut: async () => {},
  refreshRole: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({
  children,
  initialUser = null,
  initialRole = 'student',
}: {
  children: React.ReactNode;
  initialUser?: User | null;
  initialRole?: UserRole;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [loading, setLoading] = useState(!initialUser);

  const fetchRole = useCallback(async (userId: string) => {
    try {
      const supabase = createSupabaseBrowser();
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (data?.role) {
        setRole(data.role as UserRole);
      }
    } catch {
      // Default to student if fetch fails
    }
  }, []);

  const hydrateAuthState = useCallback(async () => {
    const supabase = createSupabaseBrowser();

    try {
      const [
        { data: { session } },
        { data: { user } },
      ] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);

      const currentUser = user ?? session?.user ?? null;

      setSession(session);
      setUser(currentUser);

      if (currentUser) {
        await fetchRole(currentUser.id);
      } else {
        setRole('student');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchRole]);

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    void hydrateAuthState();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchRole(session.user.id);
      } else {
        setRole('student');
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRole, hydrateAuthState]);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Middleware will eventually clear cache cookies on next navigation.
    });
    setSession(null);
    setUser(null);
    setRole('student');
    setLoading(false);
  }, []);

  const refreshRole = useCallback(async () => {
    if (user) {
      await fetchRole(user.id);
    }
  }, [user, fetchRole]);

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}
