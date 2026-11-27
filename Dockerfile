# syntax=docker/dockerfile:1

# ---- Abhängigkeiten und Build ---------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Schlankes Laufzeit-Image ---------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/uploads
# Texterkennung für Dokumente: pdftotext/pdftoppm (poppler) und tesseract mit deutschen Sprachdaten
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-deu
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/uploads && chown app:app /app/uploads
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
