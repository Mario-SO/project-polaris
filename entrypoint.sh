#!/usr/bin/env sh
set -e

# Path to the SQLite database file
DB_FILE="/app/data/gtfs.sqlite"

# If the database doesn't exist, fetch GTFS data and load it
if [ ! -f "$DB_FILE" ]; then
  echo "Database not found at $DB_FILE. Fetching and loading GTFS data..."
  bun run ./scripts/get-timetables.ts
  bun run ./api/src/load-data.ts
else
  echo "Database found at $DB_FILE. Skipping data load."
fi

# Start the API
echo "Starting Renfe Timetables API..."
exec bun run api/src/index.ts 