FROM node:20-slim

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Install Python, pip, venv, and system utilities
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create Python virtual environment and install Scrapling with Playwright
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Install scrapling and its requirements
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir "scrapling[all]>=0.4.0"

# Install playwright chromium and its system dependencies
RUN playwright install chromium && \
    playwright install-deps

# Copy Node.js dependency manifests
COPY package.json package-lock.json* ./

# Install all Node.js dependencies (including devDependencies for build)
RUN npm ci

# Copy the rest of the project files
COPY . .

# Build the Next.js application
RUN npm run build

# Prune devDependencies to keep the node_modules size minimal
RUN npm prune --omit=dev

# Expose the API server port
EXPOSE 3000

# Start Next.js API server
CMD ["npm", "start"]
