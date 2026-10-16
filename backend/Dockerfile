# Node 20 based - matches the pinned engine and provides a stable fetch built in.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=optional || npm install --omit=optional

COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript so dist/index.js exists before the container starts.
RUN npm run build

# node-oracledb thin mode ships with the npm package; no Oracle instant client needed.
ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start:prod"]