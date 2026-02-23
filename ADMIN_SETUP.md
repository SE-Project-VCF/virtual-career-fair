# Administrator Account Setup

Administrator accounts are **not** available through public registration for security reasons. Only authorized personnel can create admin accounts.

## Method 1: Using the Script (Recommended)

1. **Set up the admin secret key** in your `.env` file:
   ```env
   ADMIN_SECRET_KEY=your-super-secret-key-here-change-this
   ```

2. **Run the create admin script**:
   ```bash
   cd backend
   node scripts/createAdmin.js <email> <password> [firstName] [lastName]
   ```

   Example:
   ```bash
   node scripts/createAdmin.js admin@example.com SecurePass123 John Doe
   ```

3. **The script will**:
   - Create a new admin account if the email doesn't exist
   - Upgrade an existing user to admin if the email exists
   - Auto-verify the email (no verification needed)
   - Set up Stream Chat integration if configured

## Method 2: Using the API Endpoint

You can also create admin accounts via the API endpoint, but you'll need the `ADMIN_SECRET_KEY`:

```bash
curl -X POST http://localhost:5000/api/create-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePass123",
    "firstName": "John",
    "lastName": "Doe",
    "adminSecret": "your-super-secret-key-here"
  }'
```

## Security Best Practices

1. **Use a strong secret key**: Generate a long, random string for `ADMIN_SECRET_KEY`
   ```bash
   # Generate a secure random key (Linux/Mac)
   openssl rand -hex 32
   
   # Or use an online generator
   ```

2. **Never commit the secret key**: Make sure `.env` is in your `.gitignore`

3. **Limit admin accounts**: Only create admin accounts for trusted personnel

4. **Rotate keys periodically**: Change `ADMIN_SECRET_KEY` periodically and update all scripts/tools that use it

5. **Use environment-specific keys**: Use different keys for development, staging, and production

## Upgrading Existing Users

If a user already exists with the email, the script will upgrade them to administrator role. This is useful if you want to promote an existing company owner or representative to admin.

## Troubleshooting

- **"ADMIN_SECRET_KEY not set"**: Make sure you've added `ADMIN_SECRET_KEY` to your `.env` file
- **"User already exists"**: The script will upgrade them to admin automatically
- **"Invalid admin secret key"**: Check that the key in your `.env` matches what you're using

