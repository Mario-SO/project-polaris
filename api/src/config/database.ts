import path from 'path';

// Determine the correct path to the data directory from api/src/config
// import.meta.dir is the directory of the current file (api/src/config)
export const DB_PATH = path.resolve(import.meta.dir, '../../../data/gtfs.sqlite');

console.log(`DB_PATH configured as: ${DB_PATH}`); 