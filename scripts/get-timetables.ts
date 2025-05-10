import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

const FILE_URL = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, '../data');
const TEMP_ZIP_PATH = path.join(OUTPUT_DIR, 'fomento_transit.zip');

console.log(`Script __dirname: ${__dirname}`);
console.log(`Target OUTPUT_DIR: ${OUTPUT_DIR}`);
console.log(`Temporary ZIP path: ${TEMP_ZIP_PATH}`);

async function downloadFile(url: string, outputPath: string): Promise<void> {
    console.log(`Downloading ${url} to ${outputPath}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText} (status: ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(outputPath, buffer);
    console.log(`Download complete. File size: ${buffer.length} bytes.`);
}

async function unzipFile(zipPath: string, extractToPath: string): Promise<void> {
    console.log(`Unzipping ${zipPath} to ${extractToPath}...`);
    try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractToPath, /*overwrite*/ true);
        console.log('Unzip complete.');

        // Log contents of the output directory
        try {
            const files = await fs.promises.readdir(extractToPath);
            console.log(`Contents of ${extractToPath}:`);
            files.forEach(file => console.log(`- ${file}`));
            if (files.length === 0) {
                console.log(`(Directory ${extractToPath} is empty after unzipping)`);
            }
        } catch (readdirError) {
            console.error(`Error reading contents of ${extractToPath}:`, readdirError);
        }

    } catch (error) {
        console.error(`Error unzipping file: ${error}`);
        throw error;
    }
}

async function main() {
    try {
        console.log(`Ensuring output directory ${OUTPUT_DIR} exists...`);
        if (!fs.existsSync(OUTPUT_DIR)) {
            console.log(`Creating directory ${OUTPUT_DIR}...`);
            await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
            console.log(`Directory ${OUTPUT_DIR} created.`);
        } else {
            console.log(`Directory ${OUTPUT_DIR} already exists.`);
        }

        await downloadFile(FILE_URL, TEMP_ZIP_PATH);
        await unzipFile(TEMP_ZIP_PATH, OUTPUT_DIR);

        // Temporarily disable deleting the zip file for debugging
        // console.log(`Deleting temporary file ${TEMP_ZIP_PATH}...`);
        // await fs.promises.unlink(TEMP_ZIP_PATH);
        // console.log('Temporary file deleted.');
        console.log(`Skipping deletion of temporary file ${TEMP_ZIP_PATH} for debugging.`);


        console.log('Process completed successfully.');

    } catch (error) {
        console.error('An error occurred in main:', error);
        process.exit(1);
    }
}

main();
