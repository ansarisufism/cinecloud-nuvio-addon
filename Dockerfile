FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY manifest.json ./manifest.json
COPY src ./src
COPY data ./data
EXPOSE 7000
CMD ["npm", "start"]
