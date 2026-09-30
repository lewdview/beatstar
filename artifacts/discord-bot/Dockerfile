FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev

# Copy compiled JavaScript dist and bundled 365 data catalogs
COPY dist ./dist
COPY data ./data

ENV NODE_ENV=production

# Start Discord Bot
CMD ["node", "dist/index.js"]
