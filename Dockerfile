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

# CouchDB setup script'ini kopyala
COPY couchdb-setup.sh /docker-entrypoint.d/couchdb-setup.sh
RUN chmod +x /docker-entrypoint.d/couchdb-setup.sh 2>/dev/null || true

# React Router + CouchDB Proxy nginx yapılandırması
# - Tüm route'lar index.html'e yönlendirilir (SPA)
# - /couchdb/ istekleri CouchDB'ye proxy edilir (CORS sorunu önlenir)
# - gzip sıkıştırma aktif
# - Cache başlıkları ayarlanmış
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX_CONF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # CouchDB reverse proxy — CORS sorunlarını önler
    location /couchdb/ {
        proxy_pass http://couchdb:5984/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

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
