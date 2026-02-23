import { streamClient } from "./streamClient";

export async function getOrCreateDirectChannel(
  currentUserId: string,
  repUserId: string
) {
  if (!streamClient) throw new Error("Stream client not initialized.");

  // Look for an existing 1-on-1 messaging channel between these two users
  const result = await streamClient.queryChannels({
    type: "messaging",
    member_count: 2,
    members: { $in: [currentUserId, repUserId] },
  });

  if (result.length > 0) {
    const existing = result[0];
    await existing.watch();
    return existing;
  }

  // No existing channel → create a new one
  const channelId = `dm_${currentUserId}_${repUserId}`;
  const channel = streamClient.channel("messaging", channelId, {
    members: [currentUserId, repUserId],
  });

  await channel.create();
  await channel.watch();
  return channel;
}
