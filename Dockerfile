# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory to /app
WORKDIR /app

# Copy the backend package.json and package-lock.json
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --omit=dev

# Copy the rest of the backend directory contents into the container at /app
COPY backend/ .

# Install system deps + download AND decompress Tesseract eng.traineddata at BUILD TIME.
# We store it in /app/tessdata (not /tmp, because HF mounts tmpfs over /tmp at runtime).
RUN apt-get update && apt-get install -y --no-install-recommends curl libvips-dev \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/tessdata \
    && curl -sSL "https://github.com/naptha/tessdata/blob/gh-pages/4.0.0_best/eng.traineddata.gz?raw=true" \
       -o /app/tessdata/eng.traineddata.gz \
    && gunzip -f /app/tessdata/eng.traineddata.gz \
    && echo "Tesseract eng.traineddata downloaded and decompressed successfully"

# Ensure uploads dir exists and /app is writable by non-root user
RUN mkdir -p /app/uploads

# Hugging Face runs containers as user 1000 (node). Ensure /app is writable.
RUN chown -R node:node /app
USER node

# Production mode
ENV NODE_ENV=production

# Hugging Face exposes port 7860 by default for Docker spaces
ENV PORT=7860
EXPOSE 7860

# Simple healthcheck so Docker/HF knows the container is alive
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://localhost:7860/api/health',s=>{process.exit(s.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(3000,()=>process.exit(1))"

# Run the backend server
CMD ["node", "server.js"]
