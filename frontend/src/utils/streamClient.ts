import { StreamChat } from "stream-chat";

const apiKey = import.meta.env.VITE_STREAM_API_KEY;
if (!apiKey) {
  console.warn("Missing VITE_STREAM_API_KEY - Chat features will not work");
}

// Only create client if API key exists
export const streamClient = apiKey ? StreamChat.getInstance(apiKey) : null;
