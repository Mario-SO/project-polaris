# Use the official Bun image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy package descriptors and lockfile first to leverage Docker cache
COPY api/package.json api/bun.lock ./api/
RUN cd api && bun install

# Copy the rest of the code
COPY . .

# Copy entrypoint script and make it executable
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Expose the port the API listens on
EXPOSE 3000

# Use entrypoint to load data if needed and start the API
CMD ["sh", "./entrypoint.sh"] 