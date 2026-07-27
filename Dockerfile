# Étape 1 : Build du frontend Vue.js
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Étape 2 : Build du backend et assemblage final
FROM node:20-alpine
WORKDIR /app/backend

# Installer les outils système nécessaires (SQLite, etc.)
RUN apk add --no-cache sqlite python3 make g++ curl

COPY backend/package*.json ./
# Installer les dépendances backend
RUN npm install --production

# Copier le code source backend
COPY backend/ ./

# Créer un dossier public pour servir le frontend
RUN mkdir -p public
COPY --from=frontend-build /app/frontend/dist /app/backend/public

# Variables d'environnement par défaut
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
