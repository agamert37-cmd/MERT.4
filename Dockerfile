# ─── Aşama 1: Build ───────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Önce bağımlılıkları kopyala (cache için)
COPY package*.json ./
RUN npm install

# Kaynak kodları kopyala ve build al
COPY . .
RUN npm run build

# ─── Aşama 2: Servis (nginx) ───────────────────────────────────
FROM nginx:alpine

# Build çıktısını nginx'e kopyala
COPY --from=builder /app/dist /usr/share/nginx/html

# React Router için nginx ayarı (tüm route'lar index.html'e gitsin)
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
