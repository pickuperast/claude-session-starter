# Anthropic API Scheduler

A Node.js script that automatically sends messages to Claude using the Claude Agent SDK at scheduled times.

## Features

✅ **Super Simple Setup**: Uses Claude Agent SDK - no manual OAuth handling needed!  
✅ **Automatic Authentication**: SDK handles all token management automatically  
✅ **Flexible Scheduling**: Set any times and timezone via .env  
✅ **Docker Support**: Runs as a containerized service with auto-restart  
✅ **GitHub Actions Deploy**: Automated deployment to remote servers

## Schedule

Default schedule sends messages 3 times daily (fully customizable):
- **7:01 AM** - First daily message (default)
- **12:01 PM** - 5 hours after first (default)
- **5:01 PM** - 5 hours after second (default)

## Prerequisites

- Node.js (v14 or higher) OR Docker
- Claude Code CLI installed (for OAuth token) OR Anthropic API key

## Quick Setup

### 1. Get Your Authentication Token

**Option A: Using Claude Code CLI (Recommended)**
```bash
# Install Claude Code CLI if you haven't
npm install -g @anthropic-ai/claude-code

# Setup token
claude setup-token
```

This will generate a token. Copy it for the next step.

**Option B: Using Anthropic API Key**
Get your API key from https://console.anthropic.com

### 2. Install and Configure

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

Edit `.env` and add your token:
```bash
CLAUDE_CODE_OAUTH_TOKEN=your_token_from_setup_token

# Customize schedule (optional)
SCHEDULE_TIMES=07:01,12:01,17:01
TIMEZONE=Asia/Karachi
```

### 3. Run

```bash
npm start
```

## Testing

Before running the scheduler, test that everything works:

```bash
npm test
```

This will:
- Verify authentication is working
- Send a test message to Claude
- Display the response
- Confirm the setup is correct

Expected output:
```
🧪 Claude Agent SDK Test
==================================================

✅ Authentication: Configured
🤖 Model: claude-haiku-4-5-20251001

📝 Testing message generation...
Generated prompt: "42+73"

🚀 Testing API connection...
Sending message to Claude...

[timestamp] Sending message to Claude...
[timestamp] Prompt: "42+73"
[timestamp] ✓ Message sent successfully
[timestamp] Response: 115

==================================================
✅ TEST PASSED!
==================================================

The scheduler is working correctly.
You can now run: npm start
```

That's it! The Claude Agent SDK handles all authentication automatically.

### Docker Deployment

```bash
# Configure environment
cp .env.example .env
# Edit .env with your token

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f scheduler
```

## GitHub Actions Deployment

This project includes automated deployment to your server via GitHub Actions.

### Setting Up GitHub Secrets

GitHub Actions uses secrets to securely store sensitive information like API keys and credentials. Follow these steps to configure them:

#### Step 1: Access Repository Secrets

1. Go to your GitHub repository
2. Click **Settings** (top menu)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click the **New repository secret** button

#### Step 2: Add Required Secrets

These secrets are **required** for deployment to work:

**`SSH_PRIVATE_KEY`**
- Your SSH private key for connecting to the server
- Generate with: `ssh-keygen -t ed25519 -C "github-actions"`
- Copy the **private key** content: `cat ~/.ssh/id_ed25519`
- Paste the entire key including `-----BEGIN` and `-----END` lines
- Make sure the public key is added to your server's `~/.ssh/authorized_keys`

**`SERVER_IP`**
- Your server's IP address or domain name
- Example: `123.45.67.89` or `server.example.com`

**`GH_PERSONAL_ACCESS_TOKEN`**
- GitHub Personal Access Token for cloning private repositories
- Create at: https://github.com/settings/tokens
- Select scopes: `repo` (Full control of private repositories)
- Copy the token (starts with `ghp_`)

**`CLAUDE_CODE_OAUTH_TOKEN`** (or `ANTHROPIC_API_KEY`)
- Your Claude authentication token
- Get it by running: `claude setup-token`
- OR use API key from: https://console.anthropic.com
- **Choose ONE**: Either OAuth token OR API key

#### Step 3: Add Optional Secrets

These secrets are **optional** and have default values:

**`MODEL`**
- Claude model to use
- Default: `claude-haiku-4-5-20251001`

**`SCHEDULE_TIMES`**
- When to run the scheduler (comma-separated, 24-hour format)
- Default: `07:01,12:01,17:01`
- Example: `06:00,12:00,18:00,00:00` (every 6 hours)

**`TIMEZONE`**
- IANA timezone name
- Default: `Asia/Karachi`
- Examples: `America/New_York`, `Europe/London`, `UTC`

**`MESSAGE_PROMPT`**
- Custom message to send (optional)
- Default: Random math problems like "42+73"
- Example: `Hello! Keeping the session alive.`

**`ANTHROPIC_API_KEY`** (alternative to OAuth token)
- If you prefer API key over OAuth token
- Get from: https://console.anthropic.com
- Starts with: `sk-ant-api03-`

#### Step 4: Verify Secrets

After adding all secrets, you should see them listed:

```
✓ SSH_PRIVATE_KEY
✓ SERVER_IP  
✓ GH_PERSONAL_ACCESS_TOKEN
✓ CLAUDE_CODE_OAUTH_TOKEN
✓ MODEL (optional)
✓ SCHEDULE_TIMES (optional)
✓ TIMEZONE (optional)
✓ MESSAGE_PROMPT (optional)
```

### Deployment Triggers

The workflow deploys automatically when:
- You push to the `main` branch
- You manually trigger it from the **Actions** tab

### Manual Deployment

To manually trigger a deployment:

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Select **Deploy to Server** workflow
4. Click **Run workflow** button
5. Select the branch (usually `main`)
6. Click **Run workflow**

### Server Requirements

Your deployment server must have:
- **Ubuntu/Debian-based** Linux distribution
- **Docker** and **Docker Compose** installed
  ```bash
  # Install Docker
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  
  # Install Docker Compose
  sudo apt-get update
  sudo apt-get install docker-compose-plugin
  ```
- **SSH access** configured with your public key
- **User with sudo permissions** (default username: `ubuntu`)
  ```bash
  # Add your public key to server
  ssh-copy-id ubuntu@your-server-ip
  
  # Or manually:
  # Copy ~/.ssh/id_ed25519.pub to server's ~/.ssh/authorized_keys
  ```

### Troubleshooting Deployment

**SSH Connection Failed**
- Verify `SSH_PRIVATE_KEY` is the complete private key
- Check `SERVER_IP` is correct
- Ensure public key is in server's `~/.ssh/authorized_keys`
- Test manually: `ssh ubuntu@your-server-ip`

**Authentication Failed**
- Run `claude setup-token` and update `CLAUDE_CODE_OAUTH_TOKEN`
- Or verify `ANTHROPIC_API_KEY` from console.anthropic.com
- Make sure you added the secret correctly (no extra spaces)

**Docker Not Found**
- SSH into server and install Docker:
  ```bash
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  ```

**Permission Denied**
- Ensure server user has Docker permissions:
  ```bash
  sudo usermod -aG docker ubuntu
  # Then logout and login again
  ```

**Workflow Fails to Clone Repository**
- Check `GH_PERSONAL_ACCESS_TOKEN` has `Contents` read-only scope
- For public repos, this token is less critical but still recommended
- For private repos, this token is required

### Viewing Deployment Logs

1. Go to **Actions** tab in your repository
2. Click on the latest workflow run
3. Click **Deploy to Server** job
4. Expand steps to see detailed logs
5. Check server logs: `ssh ubuntu@server-ip "cd /var/www/claude-session-starter && docker-compose logs"`

---

## Running in Production (Without Docker)

For continuous operation with PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start the scheduler
pm2 start scheduler.js --name anthropic-scheduler

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup
```

## Customization

### Model Selection

Set the Claude model via .env:

```bash
MODEL=claude-haiku-4-5-20251001  # Fast and cost-effective (default)
# MODEL=claude-3-5-sonnet-20241022  # More capable
# MODEL=claude-opus-4  # Most capable
```

### Schedule Timesand Timezone

Configure via `.env` file:

```bash
# Set custom times (comma-separated, 24-hour format HH:MM)
SCHEDULE_TIMES=06:00,11:00,16:00,21:00

# Set timezone (IANA timezone name)
TIMEZONE=America/New_York

# Or use UTC
TIMEZONE=UTC

# Or other regions
TIMEZONE=Europe/London
TIMEZONE=Asia/Tokyo
```

**Examples:**
- Every 4 hours: `SCHEDULE_TIMES=00:00,04:00,08:00,12:00,16:00,20:00`
- Every 6 hours: `SCHEDULE_TIMES=00:00,06:00,12:00,18:00`
- Twice daily: `SCHEDULE_TIMES=09:00,21:00`
- Business hours only: `SCHEDULE_TIMES=09:00,13:00,17:00`

**Finding your timezone:**
- [List of IANA timezones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
- Common: `America/New_York`, `Europe/London`, `Asia/Tokyo`, `UTC`

### Message Content

By default, the scheduler sends random math problems like "42+73" to keep sessions active.

To send a custom message instead:

```bash
MESSAGE_PROMPT=Hello! This is my custom message.
```

Leave `MESSAGE_PROMPT` empty or unset to use random math problems (default behavior).

## Monitoring

### Docker Logs
```bash
docker-compose logs -f scheduler
```

### PM2 Logs
```bash
pm2 logs anthropic-scheduler
pm2 status
```

## Troubleshooting

**Authentication Error**
- Run `claude setup-token` to get a fresh token
- Or verify your `ANTHROPIC_API_KEY` is correct

**Token Format**
- OAuth tokens start with various prefixes (sk-ant-)
- API keys start with sk-ant-api03-

**Schedule Not Working**
- Verify timezone is correct: `TIMEZONE=Your/Timezone`
- Check time format is HH:MM (24-hour)
- View logs: `docker-compose logs -f scheduler`

**Docker Issues**
- Check status: `docker-compose ps`
- View logs: `docker-compose logs`
- Rebuild: `docker-compose up -d --build`
