# Environment Variables Setup

Your backend requires a `.env` file in the `backend/` directory to store sensitive configuration.

## Quick Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create a `.env` file** (copy the template below):
   ```bash
   # On Windows (PowerShell)
   New-Item -Path .env -ItemType File
   
   # On Mac/Linux
   touch .env
   ```

3. **Add the following content to `.env`:**

```env
# Stream Chat API Configuration
# Get these from your Stream Chat dashboard: https://dashboard.getstream.io/
# If you don't have Stream Chat set up yet, you can leave these empty for now
STREAM_API_KEY=your-stream-api-key-here
STREAM_API_SECRET=your-stream-api-secret-here

# Admin Account Creation Secret Key
# Generate a secure random string for this
# You can use: openssl rand -hex 32
# Or generate one online: https://www.random.org/strings/
ADMIN_SECRET_KEY=your-super-secret-admin-key-here-change-this
```

## Generating a Secure Admin Secret Key

### Option 1: Using OpenSSL (Mac/Linux)
```bash
openssl rand -hex 32
```

### Option 2: Using PowerShell (Windows)
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

### Option 3: Online Generator
Visit https://www.random.org/strings/ and generate a 64-character random string.

### Option 4: Quick Simple Key (for development only)
For development/testing, you can use a simple key like:
```
ADMIN_SECRET_KEY=dev-secret-key-12345-change-in-production
```

⚠️ **Warning**: Use a strong, random key in production!

## Stream Chat Setup (Optional)

If you're using Stream Chat for messaging features:

1. Sign up at https://dashboard.getstream.io/
2. Create a new app
3. Copy your API Key and API Secret
4. Add them to your `.env` file

If you're not using Stream Chat yet, you can leave these empty or use placeholder values. The app will still work, but chat features won't function.

## Verify Setup

After creating your `.env` file, restart your backend server:

```bash
cd backend
node server.js
```

The server should start without errors. If you see errors about missing environment variables, double-check your `.env` file.

## Security Notes

- ✅ The `.env` file is already in `.gitignore` - it won't be committed to git
- ✅ Never share your `.env` file or commit it to version control
- ✅ Use different keys for development, staging, and production
- ✅ Rotate your `ADMIN_SECRET_KEY` periodically

## Example `.env` File

Here's what a complete `.env` file might look like:

```env
STREAM_API_KEY=abc123xyz789
STREAM_API_SECRET=secret123xyz789
ADMIN_SECRET_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

## Next Steps

Once your `.env` file is set up, you can create an admin account:

```bash
cd backend
node scripts/createAdmin.js admin@example.com SecurePass123 John Doe
```

