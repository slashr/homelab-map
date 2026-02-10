# Build stage
FROM oven/bun:1.3.9-alpine AS build

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
# patch-package runs in postinstall; copy patches in before installing deps.
COPY patches ./patches

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build the app
RUN bun run build

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
