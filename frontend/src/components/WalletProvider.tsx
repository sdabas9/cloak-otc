"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Session, SessionKit } from "@wharfkit/session";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WalletPluginAnchor } from "@wharfkit/wallet-plugin-anchor";
import { TELOS_CHAIN_ID, TELOS_RPC } from "@/lib/constants";

interface WalletContextType {
  session: Session | null;
  accountName: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const WalletContext = createContext<WalletContextType>({
  session: null,
  accountName: null,
  login: async () => {},
  logout: async () => {},
  loading: true,
});

export function useWallet() {
  return useContext(WalletContext);
}

let sessionKit: SessionKit | null = null;

function getSessionKit(): SessionKit {
  if (!sessionKit) {
    sessionKit = new SessionKit({
      appName: "CLOAK OTC",
      chains: [
        {
          id: TELOS_CHAIN_ID,
          url: TELOS_RPC,
        },
      ],
      ui: new WebRenderer(),
      walletPlugins: [new WalletPluginAnchor()],
    });
  }
  return sessionKit;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const kit = getSessionKit();
    kit
      .restore()
      .then((restored) => {
        if (restored) setSession(restored);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async () => {
    const kit = getSessionKit();
    const response = await kit.login();
    setSession(response.session);
  }, []);

  const logout = useCallback(async () => {
    const kit = getSessionKit();
    if (session) {
      await kit.logout(session);
      setSession(null);
    }
  }, [session]);

  const accountName = session ? String(session.actor) : null;

  return (
    <WalletContext.Provider value={{ session, accountName, login, logout, loading }}>
      {children}
    </WalletContext.Provider>
  );
}
