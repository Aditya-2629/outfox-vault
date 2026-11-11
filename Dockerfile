FROM node:18-alpine

WORKDIR /app

# Copy project files
COPY package*.json ./
COPY . .

# Expose port (Render sets $PORT dynamically)
ENV PORT=4000
EXPOSE 4000

# Start server
CMD ["node", "server.js"]
