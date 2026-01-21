
import fs from 'fs';

const CLOUD_NAME = 'dm1mue41j';
const UPLOAD_PRESET = 'FSW';
const LOGO_URL = 'https://fsw.uk.com/wp-content/uploads/2023/12/FSWGroup-logos-01-300x300.png';

async function uploadLogo() {
  console.log(`Downloading logo from ${LOGO_URL}...`);
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) throw new Error(`Failed to fetch logo: ${response.statusText}`);
    const blob = await response.blob();

    console.log('Uploading to Cloudinary...');
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', UPLOAD_PRESET);

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Cloudinary upload failed: ${errText}`);
    }

    const data = await uploadRes.json();
    console.log('SUCCESS! Logo uploaded to Cloudinary.');
    console.log('Secure URL:', data.secure_url);
    console.log('Public ID:', data.public_id);
  } catch (error) {
    console.error('Error:', error);
  }
}

uploadLogo();
