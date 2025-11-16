const { StreamChat } = require("stream-chat");

// IMPORTANT: these must match your .env values
const STREAM_API_KEY = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;

if (!STREAM_API_KEY || !STREAM_API_SECRET) {
  console.error("❌ Missing Stream Chat server key/secret");
  process.exit(1);
}

const streamServerClient = StreamChat.getInstance(
  STREAM_API_KEY,
  STREAM_API_SECRET
);

module.exports = { streamServerClient };
