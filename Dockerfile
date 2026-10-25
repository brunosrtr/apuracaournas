# Servidor da apuração (API + coleta no TSE + modelo + interface) — para Coolify ou qualquer host Docker.
# O servidor roda TypeScript direto (type stripping), por isso o Node precisa ser 23.6+.
FROM node:25-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npx vite build

ENV NODE_ENV=production \
    PORTA=8787 \
    MODO_PUBLICO=1
EXPOSE 8787

# base histórica, malhas, fotos e o estado salvo da apuração: monte um volume aqui para sobreviver a redeploys
VOLUME ["/app/data"]

# na primeira subida o servidor baixa e prepara a base histórica antes de abrir a porta
HEALTHCHECK --interval=20s --timeout=5s --start-period=300s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/status').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.ts"]
