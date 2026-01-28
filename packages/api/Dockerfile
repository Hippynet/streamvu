# Development Dockerfile
FROM node:20-alpine

# Install build dependencies for mediasoup and FFmpeg for encoding
RUN apk add --no-cache python3 py3-pip make g++ linux-headers ffmpeg

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./

# Copy package definitions
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api

# Build shared package
RUN pnpm --filter @streamvu/shared run build

# Generate Prisma client
RUN pnpm --filter @streamvu/api run db:generate || true

EXPOSE 3002

CMD ["pnpm", "--filter", "@streamvu/api", "run", "dev"]
