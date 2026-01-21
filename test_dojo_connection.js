
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
try {
    const envPath = path.resolve(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
} catch (e) {
    console.error("Could not read .env file:", e);
}

const openai = new OpenAI({
    apiKey: process.env.VITE_OPENAI_API_KEY,
});

async function testConnection() {
    console.log("Testing OpenAI Connection with gpt-4o-mini...");
    if (!process.env.VITE_OPENAI_API_KEY) {
        console.error("ERROR: VITE_OPENAI_API_KEY is missing from .env");
        return;
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a test bot." },
                { role: "user", content: "Say hello." }
            ]
        });
        console.log("Success!");
        console.log("Response:", completion.choices[0].message.content);
    } catch (error) {
        console.error("Connection Failed!");
        console.error("Error Name:", error.name);
        console.error("Error Message:", error.message);
        // console.error("Full Error:", error);
    }
}

testConnection();
