"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { normaliseVisits, type NodeVisits } from "@/lib/node-life";
import { toastError } from "@/lib/toast";

const NodeLifeContext = createContext({ ready: false, visits: {} as NodeVisits, visit: (_id: string) => {} });

export function NodeLifeProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const key = `node.visits.v1:${accountId}`;
  const [ready, setReady] = useState(false);
  const [visits, setVisits] = useState<NodeVisits>({});
  const current = useRef<NodeVisits>({});
  useEffect(() => {
    try { current.current = normaliseVisits(JSON.parse(localStorage.getItem(key) ?? "null"), Date.now()); }
    catch { toastError(new Error("This browser could not restore when you last visited your nodes.")); }
    setVisits(current.current);
    setReady(true);
  }, [key]);
  const visit = useCallback((id: string) => {
    const now = Date.now();
    const next = normaliseVisits({ ...current.current, [id]: now }, now);
    current.current = next;
    setVisits(next);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { toastError(new Error("This browser could not remember your node's visit. Your chat is unaffected.")); }
  }, [key]);
  return <NodeLifeContext value={{ ready, visits, visit }}>{children}</NodeLifeContext>;
}

export const useNodeVisits = () => useContext(NodeLifeContext);
