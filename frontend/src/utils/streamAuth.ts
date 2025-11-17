import { streamClient } from "./streamClient";

export async function connectStreamDev(user: {
  uid: string; name?: string; email?: string; photoURL?: string;
}) {
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
  try { await streamClient.disconnectUser(); } catch {}
}
