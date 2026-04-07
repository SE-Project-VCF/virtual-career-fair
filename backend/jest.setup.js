process.env.STREAM_API_KEY = "test-stream-key";
process.env.STREAM_API_SECRET = "test-stream-secret";
process.env.ADMIN_SECRET_KEY = "test-admin-secret";
process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.INVITE_CODE_SECRET = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(console, "log").mockImplementation(() => {});
