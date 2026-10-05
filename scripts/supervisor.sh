#!/bin/sh
# Mantém o servidor no ar: se o processo terminar, sobe de novo em 3 s.
# Para parar de vez: touch data/parar  (e encerre o processo do node)
cd "$(dirname "$0")/.."
while [ ! -f data/parar ]; do
  node server/index.ts
  echo "[$(date +%H:%M:%S)] servidor encerrou — reiniciando em 3 s"
  sleep 3
done
