import { AppShell } from "@/components/shell";
import { ActivePlaceGate } from "@/components/active-place-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ActivePlaceGate><AppShell>{children}</AppShell></ActivePlaceGate>;
}
