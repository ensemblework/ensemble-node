"use client";

import { useParams } from "next/navigation";
import { RoomView } from "@/components/chat/room-view";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  return <RoomView key={roomId} roomId={roomId} />;
}
