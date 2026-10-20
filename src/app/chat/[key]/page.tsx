import type { Metadata } from "next";
import { WebChat } from "./web-chat";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function ChatPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <WebChat chatKey={key} />;
}
