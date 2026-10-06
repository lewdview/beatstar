# Stage 1: Build TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package.json package-lock.json* ./

# Install all dependencies (including TypeScript compiler)
RUN npm install

# Copy configuration and source files
COPY tsconfig.json ./
COPY src ./src
COPY data ./data

# Build TypeScript to dist/
RUN npm run build

# Stage 2: Production runtime image
FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy compiled JavaScript dist and bundled data from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

ENV NODE_ENV=production

# Start Discord Bot
CMD ["node", "dist/index.js"]
