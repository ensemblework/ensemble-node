import { ActivePlaceGate } from "@/components/active-place-gate";

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <ActivePlaceGate>{children}</ActivePlaceGate>;
}
