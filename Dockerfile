# syntax=docker/dockerfile:1

# ---- Gemeinsame Basis: Node und Werkzeuge für die Texterkennung ------------------------
# pdftotext/pdftoppm/pdfinfo (poppler) und tesseract mit deutschen und englischen Sprachdaten.
# Beide Stufen brauchen sie: die App beim Hochladen, der Seed (läuft in „migrate“ = builder)
# für die Testdokumente.
FROM node:22-alpine AS basis
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-deu tesseract-ocr-data-eng
# Derselbe Benutzer in App und Seed, damit beide die Dateien im Volume „uploads“ lesen und schreiben
# (gleiche Anlage wie bisher, damit ein bestehendes Volume weiter beschreibbar bleibt)
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/uploads && chown app:app /app/uploads
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    UPLOAD_DIR=/app/uploads

# ---- Abhängigkeiten und Build (auch für Migration und Seed) ---------------------------
FROM basis AS builder
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Schlankes Laufzeit-Image ---------------------------------------------------------
FROM basis AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
