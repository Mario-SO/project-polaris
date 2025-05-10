import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const GTFS_FILES = [
    'agency.txt',
    'stops.txt',
    'routes.txt',
    'trips.txt',
    'stop_times.txt',
    'calendar.txt',
    // 'calendar_dates.txt', // Add if present and needed
];

const DATA_DIR = path.resolve(import.meta.dir, '../../data'); // up one from src, then up one from api
const DB_PATH = path.join(DATA_DIR, 'gtfs.sqlite');

console.log(`Data directory: ${DATA_DIR}`);
console.log(`Database path: ${DB_PATH}`);

// Ensure data directory exists (it should, from the other script)
if (!fs.existsSync(DATA_DIR)) {
    console.error(`Error: Data directory ${DATA_DIR} not found. Run the get-timetables script first.`);
    process.exit(1);
}

const db = new Database(DB_PATH);
console.log(`Opened database at ${DB_PATH}`);

/**
 * Parses a CSV file content into an array of objects.
 * Assumes the first line is the header.
 * Handles quoted fields by simply removing quotes, does not handle escaped quotes within fields.
 */
async function parseCSV(filePath: string): Promise<Array<Record<string, string>>> {
    console.log(`Parsing ${filePath}...`);
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: File ${filePath} not found. Skipping.`);
        return [];
    }
    const text = await Bun.file(filePath).text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
        console.warn(`Warning: File ${filePath} has less than 2 lines (header + data). Skipping.`);
        return [];
    }

    const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const records: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        if (values.length === header.length) {
            const record: Record<string, string> = {};
            header.forEach((h, index) => {
                record[h] = values[index];
            });
            records.push(record);
        } else {
            // console.warn(`Warning: Line ${i + 1} in ${filePath} has different number of columns than header. Skipping line.`);
        }
    }
    console.log(`Parsed ${records.length} records from ${filePath}.`);
    return records;
}

/**
 * Creates a table based on GTFS file name and headers.
 * Drops the table if it already exists to ensure fresh data.
 */
function createTable(tableName: string, headers: string[]): void {
    db.run(`DROP TABLE IF EXISTS ${tableName};`);
    // Basic type guessing - TEXT for all initially for simplicity, can be refined
    const columns = headers.map(h => `${h} TEXT`).join(', ');
    // Attempt to define primary keys for known tables
    let primaryKeyClause = '';
    if (tableName === 'stops' && headers.includes('stop_id')) primaryKeyClause = ', PRIMARY KEY (stop_id)';
    else if (tableName === 'routes' && headers.includes('route_id')) primaryKeyClause = ', PRIMARY KEY (route_id)';
    else if (tableName === 'trips' && headers.includes('trip_id')) primaryKeyClause = ', PRIMARY KEY (trip_id)';
    else if (tableName === 'agency' && headers.includes('agency_id')) primaryKeyClause = ', PRIMARY KEY (agency_id)';
    else if (tableName === 'calendar' && headers.includes('service_id')) primaryKeyClause = ', PRIMARY KEY (service_id)';
    // For stop_times, a composite key is more appropriate but complex to define generically here.
    // Let's add indexes later if needed for performance.

    const ddl = `CREATE TABLE ${tableName} (${columns}${primaryKeyClause});`;
    console.log(`Executing DDL for ${tableName}: ${ddl}`);
    db.run(ddl);
    console.log(`Table ${tableName} created.`);
}

/**
 * Inserts records into the specified table.
 */
function insertData(tableName: string, headers: string[], records: Array<Record<string, string>>): void {
    if (records.length === 0) {
        console.log(`No records to insert into ${tableName}.`);
        return;
    }
    const placeholders = headers.map(() => '?').join(', ');
    const insertSQL = `INSERT INTO ${tableName} (${headers.join(', ')}) VALUES (${placeholders});`;
    const stmt = db.prepare(insertSQL);

    db.transaction(() => {
        for (const record of records) {
            const values = headers.map(h => record[h] !== undefined ? record[h] : null);
            try {
                 stmt.run(...values);
            } catch (e: any) {
                // console.error(`Failed to insert record into ${tableName}:`, record, e.message);
            }
        }
    })(); // Immediately invoke the transaction
    console.log(`Inserted ${records.length} records into ${tableName}.`);
}

async function main() {
    console.log('Starting GTFS data loading process...');
    for (const fileName of GTFS_FILES) {
        const tableName = fileName.replace('.txt', '');
        const filePath = path.join(DATA_DIR, fileName);

        console.log(`\nProcessing ${fileName} for table ${tableName}...`);
        const records = await parseCSV(filePath);

        if (records.length > 0) {
            const headers = Object.keys(records[0]);
            createTable(tableName, headers);
            insertData(tableName, headers, records);
        } else {
            console.log(`No records found in ${fileName}, skipping table creation and data insertion for ${tableName}.`);
            // Optionally, still create an empty table if desired
            // const tempHeaders = await Bun.file(filePath).text().then(t => t.slice(0,t.indexOf('\n')).split(',').map(h => h.trim().replace(/^"|"$/g, '')));
            // if(tempHeaders.length > 0 && tempHeaders[0] !== '') createTable(tableName, tempHeaders);
        }
    }

    db.close();
    console.log('\nGTFS data loading process completed.');
    console.log(`Database ${DB_PATH} should now be populated.`);
}

main().catch(err => {
    console.error('Error during data loading:', err);
    if (db) db.close();
    process.exit(1);
}); 