"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, Me } from "./api";

type Ctx = { me: Me | null; loading: boolean; refresh: () => Promise<Me | null>; can: (p: string) => boolean };
const SessionCtx = createContext<Ctx>({ me: null, loading: true, refresh: async () => null, can: () => false });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/auth/me");
      setMe(m);
      return m;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const can = useCallback((p: string) => !!me?.permissions.includes(p), [me]);
  return <SessionCtx.Provider value={{ me, loading, refresh, can }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
