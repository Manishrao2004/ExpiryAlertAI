# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Install system dependencies required by sharp and tesseract (if needed)
# Node slim images don't always have everything needed for image processing libraries.
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory to /app
WORKDIR /app

# Copy the backend package.json and package-lock.json
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install

# Copy the rest of the backend directory contents into the container at /app
COPY backend/ .

# Hugging Face exposes port 7860 by default for Docker spaces
# We will set our server to listen on 7860
ENV PORT=7860
EXPOSE 7860

# Run the backend server
CMD ["npm", "start"]
