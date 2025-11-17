import { StreamChat } from "stream-chat";

const apiKey = import.meta.env.VITE_STREAM_API_KEY;
if (!apiKey) console.error("Missing VITE_STREAM_API_KEY");

export const streamClient = StreamChat.getInstance(apiKey!);
