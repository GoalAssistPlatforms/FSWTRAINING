import dotenv from 'dotenv';
dotenv.config();

globalThis.import = { meta: { env: process.env } };

import { generateThumbnail } from './src/api/images.js';

async function test() {
    console.log("Starting generation...");
    const url = await generateThumbnail("Cyber Security Basics");
    console.log("Result URL:", url);
}

test();
