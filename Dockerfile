# ─── Aşama 1: Build ───────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Bağımlılıkları önce kopyala — Docker cache katmanı için
COPY package*.json ./

# node_modules'u temiz kur (ci = package-lock'a göre tam uyumlu)
RUN npm ci --prefer-offline || npm install

# Kaynak kodları kopyala
COPY . .

# Olası önceki dist kalıntılarını temizle
RUN rm -rf dist

# Production build
RUN npm run build

# ─── Aşama 2: Servis (nginx) ───────────────────────────────────
FROM nginx:1.27-alpine

# Build çıktısını nginx'e kopyala
COPY --from=builder /app/dist /usr/share/nginx/html

# React Router için nginx yapılandırması
# - Tüm route'lar index.html'e yönlendirilir (SPA)
# - gzip sıkıştırma aktif
# - Cache başlıkları ayarlanmış
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX_CONF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA route yönlendirmesi
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static dosyalar için agresif cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # index.html cache'lenmemeli (her zaman güncel)
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma no-cache;
        add_header Expires 0;
    }

    # Sıkıştırma
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_min_length 256;
    gzip_comp_level 6;
}
NGINX_CONF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
