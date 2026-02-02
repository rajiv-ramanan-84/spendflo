#!/bin/bash
set -e

echo "Running database migrations..."
npx prisma db push --accept-data-loss --skip-generate

echo "Starting Next.js server..."
npx next start
