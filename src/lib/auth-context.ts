import type { Session, User } from "@supabase/supabase-js";
import { createContext } from "react";
import type { AppRole, Profile } from "@/lib/auth";

export type SignInResult = { ok: true; role: AppRole } | { ok: false; message: string };

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
