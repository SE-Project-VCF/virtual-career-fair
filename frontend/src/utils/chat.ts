import { streamClient } from "./streamClient";

/**
 * Open or create a 1:1 messaging channel between two users.
 * Uses a stable channel id (sorted member ids) so it matches NewChatDialog and avoids duplicates.
 */
export async function getOrCreateDirectChannel(currentUserId: string, otherUserId: string) {
  if (!streamClient) throw new Error("Stream client not initialized.");

  const sorted = [currentUserId, otherUserId].sort((a, b) => a.localeCompare(b));
  const channelId = `dm-${sorted[0]}-${sorted[1]}`;

  const existing = await streamClient.queryChannels(
    { type: "messaging", cid: `messaging:${channelId}` },
    {},
    { limit: 1 }
  );

  if (existing.length > 0) {
    const ch = existing[0];
    await ch.watch();
    return ch;
  }

  const channel = streamClient.channel("messaging", channelId, {
    members: sorted,
  });

  await channel.create();
  await channel.watch();
  return channel;
}
