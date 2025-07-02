# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ chromium

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Use npm install if package-lock.json doesn't exist, otherwise use npm ci
RUN if [ -f "package-lock.json" ]; then \
        npm ci; \
    else \
        npm install; \
    fi

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install runtime dependencies for Puppeteer/WhatsApp Web
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Use npm install if package-lock.json doesn't exist, otherwise use npm ci
RUN if [ -f "package-lock.json" ]; then \
        npm ci --omit=dev && npm cache clean --force; \
    else \
        npm install --omit=dev && npm cache clean --force; \
    fi

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy public directory for static files (admin panel, etc)
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Create necessary directories
RUN mkdir -p whatsapp-sessions logs && \
    chown -R nodejs:nodejs whatsapp-sessions logs public

# Create a basic health check endpoint file if dist doesn't have one
RUN echo '{"status":"ok"}' > /app/health.json && \
    chown nodejs:nodejs /app/health.json

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the application
CMD ["node", "dist/main"]