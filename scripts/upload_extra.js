import fs from 'fs';
import path from 'path';

// 1. Config
const IMAGES = [
    {
        name: 'Magnifying Glass/Recruitment',
        path: 'C:/Users/josh/.gemini/antigravity/brain/dfd2cad7-550b-44ca-864d-d5c63746eb83/uploaded_image_1769117547703.jpg'
    }
];

// 2. Load Env
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = fs.readFileSync(envPath, 'utf8');
envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        process.env[key.trim()] = value.trim();
    }
});

const CLOUD_NAME = process.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.VITE_CLOUDINARY_UPLOAD_PRESET;

if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.error("Missing configuration");
    process.exit(1);
}

// 3. Main Logic
async function uploadImage(image) {
    try {
        console.log(`Reading image: ${image.name}...`);
        const imageBuffer = fs.readFileSync(image.path);
        const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('file', blob, path.basename(image.path));
        formData.append('upload_preset', UPLOAD_PRESET);
        formData.append('context', `caption=${image.name}`);

        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) {
            const err = await uploadRes.text();
            throw new Error(`Cloudinary upload failed: ${err}`);
        }

        const uploadData = await uploadRes.json();
        console.log(`SUCCESS: ${image.name} -> ${uploadData.secure_url}`);
        return { name: image.name, url: uploadData.secure_url };

    } catch (e) {
        console.error(`FAILED: ${image.name}`, e);
        return null;
    }
}

async function run() {
    console.log("Starting upload...");
    const results = [];
    for (const img of IMAGES) {
        const result = await uploadImage(img);
        if (result) results.push(result);
    }
    console.log("---------------------------------------------------");
    console.log("FINAL URL:");
    results.forEach(r => console.log(`${r.name}: ${r.url}`));
}

run();
