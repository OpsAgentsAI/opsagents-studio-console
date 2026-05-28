FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --omit=optional && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
