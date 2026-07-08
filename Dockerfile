# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory to /app
WORKDIR /app

# Copy the backend package.json and package-lock.json
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install

# Copy the rest of the backend directory contents into the container at /app
COPY backend/ .

# Download Tesseract eng.traineddata at BUILD TIME into /app/tessdata.
# We cannot use /tmp because Hugging Face mounts a tmpfs over /tmp at runtime,
# shadowing any files placed there during the build phase.
RUN apt-get update && apt-get install -y curl libvips-dev && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/tessdata \
    && curl -sSL "https://github.com/naptha/tessdata/blob/gh-pages/4.0.0_best/eng.traineddata.gz?raw=true" \
       -o /app/tessdata/eng.traineddata.gz \
    && echo "Tesseract eng.traineddata downloaded successfully"

# Hugging Face runs containers as user 1000 (node). Ensure /app is writable.
RUN chown -R node:node /app
USER node

# Hugging Face exposes port 7860 by default for Docker spaces
ENV PORT=7860
EXPOSE 7860

# Run the backend server
CMD ["node", "server.js"]
