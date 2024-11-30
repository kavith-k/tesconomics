# Build stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install dependencies first & create the pdf worker file
COPY package*.json ./
RUN mkdir -p static
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-bookworm-slim
WORKDIR /app

# Copy built application from builder stage
COPY package*.json ./
COPY --from=builder /app/build build/
COPY --from=builder /app/static static/

# Install only production dependencies & ignore prepare script
RUN npm ci --omit=dev --ignore-scripts

# Expose port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# https://svelte.dev/docs/kit/adapter-node#Environment-variables-BODY_SIZE_LIMIT
# Increasing the server's body size limit to 5MB
ENV BODY_SIZE_LIMIT=5M

# Command to run the application
CMD ["node", "build"]
