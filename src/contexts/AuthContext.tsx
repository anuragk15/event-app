import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";

const DUMMY_SESSION_KEY = "events-app-dummy-session";

export const DUMMY_USER_ID = "00000000-0000-4000-8000-000000000001";

export const DUMMY_USER_EMAIL = "alex@example.com";
export const DUMMY_USER_NAME = "Alex Rivera";

function createDummyUser(): User {
  const now = new Date().toISOString();
  return {
    id: DUMMY_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: DUMMY_USER_EMAIL,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: DUMMY_USER_NAME },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User;
}

function createDummySession(): Session {
  const user = createDummyUser();
  return {
    access_token: "dummy-access-token",
    refresh_token: "dummy-refresh-token",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    token_type: "bearer",
    user,
  };
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isDummy: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isDummy: false,
  signIn: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DUMMY_SESSION_KEY) === "1") {
        setSession(createDummySession());
      }
    } catch {
      // Ignore storage failures and stay signed out.
    }
    setLoading(false);
  }, []);

  const signIn = () => {
    const next = createDummySession();
    try {
      localStorage.setItem(DUMMY_SESSION_KEY, "1");
    } catch {
      // Session still lives for this page load.
    }
    setSession(next);
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(DUMMY_SESSION_KEY);
    } catch {
      // Clearing in-memory state is enough.
    }
    setSession(null);
  };

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    isDummy: session?.user?.id === DUMMY_USER_ID,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{loading ? null : children}</AuthContext.Provider>;
}
