FROM node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN npm ci --omit=dev

# Copy application files
COPY lib ./lib
COPY scripts ./scripts
COPY tests ./tests
COPY scheduler.js ./
COPY test.js ./

# Create non-root user
RUN addgroup --system nodejs && \
    adduser --system --ingroup nodejs nodejs && \
    mkdir -p /app/state/accounts /app/state/codex-home /app/state/logs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Start the scheduler
CMD ["node", "scheduler.js"]
