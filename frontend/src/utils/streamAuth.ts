import { streamClient } from "./streamClient";

export async function connectStreamDev(user: {
  uid: string; name?: string; email?: string; photoURL?: string;
}) {
  if (!streamClient) {
    throw new Error("Stream client is not initialized. Missing VITE_STREAM_API_KEY.");
  }
  await streamClient.connectUser(
    {
      id: user.uid,
      name: user.name || user.email || user.uid,
      image: user.photoURL || undefined,
    },
    streamClient.devToken(user.uid)
  );
}

export async function disconnectStream() {
  if (!streamClient) return;
  try { await streamClient.disconnectUser(); } catch {}
}
