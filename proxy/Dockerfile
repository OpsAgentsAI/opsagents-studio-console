FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# firebase-admin's firestore submodule requires @google-cloud/firestore which it
# declares as an optionalDependency — never use --omit=optional with firebase-admin
# or the container crashes on startup with `Cannot find module '@google-cloud/firestore'`.
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
