process.env.STREAM_API_KEY = "test-stream-key";
process.env.STREAM_API_SECRET = "test-stream-secret";
process.env.ADMIN_SECRET_KEY = "test-admin-secret";
process.env.NODE_ENV = "test";
process.env.PORT = "0";

jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(console, "log").mockImplementation(() => {});
