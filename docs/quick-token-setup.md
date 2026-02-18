# Getting Your Claude OAuth Token (Simple Method)

## The Easiest Way - From Claude Code CLI Config

If you already use Claude Code CLI, you already have a long-lived token!

### Step 1: Locate the Config File

**macOS/Linux:**
```bash
cat ~/.config/claude/config.json
```

**Windows:**
```cmd
type %USERPROFILE%\.config\claude\config.json
```

Or navigate to: `C:\Users\YourUsername\.config\claude\config.json`

### Step 2: Find the Token

The file looks like this:
```json
{
  "access_token": "sk-ant-api03-your-long-token-here...",
  "expires_at": "2027-02-18T00:00:00Z",
  "account": {
    "email": "your.email@example.com"
  }
}
```

### Step 3: Copy the Token

Copy the entire `access_token` value (the long string starting with `sk-ant-`)

### Step 4: Add to .env

Paste it into your `.env` file:
```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-api03-your-long-token-here...
```

**That's it!** No mitmproxy, no refresh tokens needed.

## Token Lifespan

- These tokens typically last **1 year**
- Check the `expires_at` field to see when yours expires
- When it expires, simply run `claude login` again and copy the new token

## When the Token Expires

If you see authentication errors, just refresh your token:

```bash
# Re-authenticate
claude login

# Copy the new token from config.json
# Update your .env file with the new token
# Restart the scheduler
```

## Security Notes

- Keep your token private - it gives full access to your Claude account
- Don't commit tokens to version control
- Store `.env` file with restricted permissions (600 on Unix systems)
- Monitor your account for unexpected activity
