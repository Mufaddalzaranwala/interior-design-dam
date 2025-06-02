# Interior Design DAM - Production Dockerfile
# Multi-stage build for optimized production deployment

# Stage 1: Dependencies
FROM node:18-alpine AS deps
WORKDIR /app

# Install dependencies needed for node-gyp
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Builder
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies needed for building
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Copy production environment file if it exists
COPY .env.production* ./

# Generate Prisma client and build the application
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:18-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Copy built application from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy database setup scripts for production migrations
COPY --from=builder --chown=nextjs:nodejs /app/database ./database
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle* ./

# Copy production dependencies from deps stage
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Create directory for SQLite (if needed for fallback)
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Health check script
COPY --chown=nextjs:nodejs <<EOF /app/healthcheck.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/api/health',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('Health check passed');
    process.exit(0);
  } else {
    console.log(\`Health check failed with status: \${res.statusCode}\`);
    process.exit(1);
  }
});

req.on('timeout', () => {
  console.log('Health check timed out');
  req.destroy();
  process.exit(1);
});

req.on('error', (error) => {
  console.log(\`Health check error: \${error.message}\`);
  process.exit(1);
});

req.end();
EOF

# Database initialization script for production
COPY --chown=nextjs:nodejs <<EOF /app/init-db.sh
#!/bin/sh
set -e

echo "Initializing database for production..."

# Check if DATABASE_URL is set
if [ -z "\$DATABASE_URL" ]; then
  echo "Warning: DATABASE_URL not set, using SQLite fallback"
  export DATABASE_URL="sqlite:/app/data/production.db"
fi

# Run database migrations
if [ "\$NODE_ENV" = "production" ]; then
  echo "Running production database setup..."
  node scripts/setup-db.js
  
  # Only seed if this is a fresh deployment
  if [ "\$SEED_DATABASE" = "true" ]; then
    echo "Seeding database with initial data..."
    node scripts/seed-db.js
  fi
fi

echo "Database initialization complete"
EOF

# Make scripts executable
RUN chmod +x /app/init-db.sh /app/healthcheck.js

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node /app/healthcheck.js

# Start command with database initialization
CMD ["/bin/sh", "-c", "/app/init-db.sh && node server.js"]

# Metadata
LABEL \
  org.opencontainers.image.title="Interior Design DAM" \
  org.opencontainers.image.description="AI-powered digital asset management for interior design firms" \
  org.opencontainers.image.vendor="Interior Design DAM" \
  org.opencontainers.image.version="1.0.0" \
  org.opencontainers.image.source="https://github.com/your-org/interior-design-dam" \
  org.opencontainers.image.licenses="MIT"

# Build arguments for CI/CD
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

LABEL \
  org.opencontainers.image.created=$BUILD_DATE \
  org.opencontainers.image.revision=$VCS_REF \
  org.opencontainers.image.version=$VERSION