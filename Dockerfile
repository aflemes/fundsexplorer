# Usa imagem base com Node.js e suporte a Puppeteer
FROM node:20-slim

# Instala dependências do Chromium
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Cria diretório da app
WORKDIR /app

# Copia dependências
COPY package*.json ./

# Instala dependências do projeto
RUN npm install

# Copia o restante da aplicação
COPY . .

# Expõe a porta para o Railway
EXPOSE 3000

# Inicia o app
CMD ["npm", "start"]
