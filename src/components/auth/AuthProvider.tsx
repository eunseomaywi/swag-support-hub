import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isAppRole, type AppRole, type Profile } from "@/lib/auth";
import { AuthContext, type AuthContextValue, type SignInResult } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase";

function asProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row["id"] !== "string" || !isAppRole(row["role"])) return null;

  return {
    id: row["id"],
    email: typeof row["email"] === "string" ? row["email"] : null,
    full_name: typeof row["full_name"] === "string" ? row["full_name"] : null,
    role: row["role"],
    created_at: typeof row["created_at"] === "string" ? row["created_at"] : "",
    updated_at: typeof row["updated_at"] === "string" ? row["updated_at"] : "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const requestId = useRef(0);
  const signInInProgress = useRef(false);
  const activeUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const currentRequest = ++requestId.current;
    setProfileError(null);

    const { data, error } = await getSupabaseClient()
      .from("profiles")
      .select("id, email, full_name, role, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (currentRequest !== requestId.current) return null;

    const nextProfile = asProfile(data);
    if (error || !nextProfile) {
      setProfile(null);
      setProfileError(
        "Your approved account profile could not be loaded. Please contact the SWAG team.",
      );
      return null;
    }

    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (activeUserId.current !== nextUserId) {
        queryClient.clear();
        activeUserId.current = nextUserId;
      }
      setSession(nextSession);

      if (!nextSession) {
        requestId.current += 1;
        setProfile(null);
        setProfileError(null);
        setLoading(false);
        return null;
      }

      setLoading(true);
      const nextProfile = await loadProfile(nextSession.user.id);
      setLoading(false);
      return nextProfile;
    },
    [loadProfile, queryClient],
  );

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setProfileError("Your session could not be restored. Please sign in again.");
        setLoading(false);
        return;
      }
      void applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "SIGNED_IN" && signInInProgress.current) return;
      // Keep the auth callback synchronous; profile work runs after Supabase releases its auth lock.
      window.setTimeout(() => {
        if (active) void applySession(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      setLoading(true);
      setProfileError(null);
      signInInProgress.current = true;

      const { data, error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.session) {
        signInInProgress.current = false;
        setLoading(false);
        return {
          ok: false,
          message: "We couldn't sign you in. Check your email and password and try again.",
        };
      }

      const nextProfile = await applySession(data.session);
      signInInProgress.current = false;

      if (!nextProfile) {
        return {
          ok: false,
          message:
            "Your approved account profile could not be loaded. Please contact the SWAG team.",
        };
      }

      return { ok: true, role: nextProfile.role };
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    try {
      await getSupabaseClient().auth.signOut({ scope: "local" });
    } finally {
      queryClient.clear();
      activeUserId.current = null;
      requestId.current += 1;
      setSession(null);
      setProfile(null);
      setProfileError(null);
      setLoading(false);
    }
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) return null;
    setLoading(true);
    const nextProfile = await loadProfile(session.user.id);
    setLoading(false);
    return nextProfile;
  }, [loadProfile, session?.user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      loading,
      profileError,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, profileError, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
