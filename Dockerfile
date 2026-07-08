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

# Download Tesseract eng.traineddata at BUILD TIME into /tmp so it's baked into
# the image. This prevents a runtime download failure when running as non-root.
# Tesseract.js looks for it in cachePath (/tmp) which we configure in ocrProcessor.js.
RUN apt-get update && apt-get install -y curl libvips-dev && rm -rf /var/lib/apt/lists/* \
    && curl -sSL "https://github.com/naptha/tessdata/blob/gh-pages/4.0.0_best/eng.traineddata.gz?raw=true" \
       -o /tmp/eng.traineddata.gz \
    && echo "Tesseract eng.traineddata downloaded successfully"

# Hugging Face runs containers as user 1000 (node). Ensure /app is writable.
RUN chown -R node:node /app
USER node

# Hugging Face exposes port 7860 by default for Docker spaces
ENV PORT=7860
EXPOSE 7860

# Run the backend server
CMD ["node", "server.js"]
