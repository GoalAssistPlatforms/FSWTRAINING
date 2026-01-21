
// Basic template literals used, no external templating engine needed

// Wait, the project seems to be using vanilla JS with template literals based on CoursePlayer.js.
// I will stick to the same pattern: a function that returns an HTML string or an element.

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export const renderCertificate = (courseTitle, userName, completionDate) => {
    // Unique ID for the certificate container to target for download
    const certId = 'certificate-container-' + Math.random().toString(36).substr(2, 9)

    return `
    <div class="certificate-wrapper fade-in" style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2rem;">
        
        <!-- Certificate Card -->
        <div id="${certId}" style="
            position: relative;
            width: 800px;
            height: 600px;
            background: #ffffff;
            color: #1a1a1a;
            padding: 4rem;
            border-radius: 8px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            font-family: 'serif'; 
            overflow: hidden;
        ">
            <!-- Border/Decorative Elements -->
            <div style="position: absolute; top: 20px; left: 20px; right: 20px; bottom: 20px; border: 2px solid #D4AF37; pointer-events: none;"></div>
            <div style="position: absolute; top: 25px; left: 25px; right: 25px; bottom: 25px; border: 1px solid #D4AF37; pointer-events: none;"></div>

            <!-- Header -->
            <div style="margin-bottom: 3rem;">
                <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 60px; margin-bottom: 2rem;">
                <h1 style="font-size: 3rem; margin: 0; color: #1a1a1a; text-transform: uppercase; letter-spacing: 4px; font-family: 'Cinzel', serif;">Certificate</h1>
                <h2 style="font-size: 1.5rem; margin: 1rem 0 0 0; color: #D4AF37; text-transform: uppercase; letter-spacing: 2px; font-weight: 400;">Of Completion</h2>
            </div>

            <!-- Body -->
            <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; width: 100%;">
                <p style="font-size: 1.2rem; color: #666; margin-bottom: 1rem; font-family: sans-serif;">This is to certify that</p>
                
                <div style="font-size: 2.5rem; font-weight: bold; color: #000; margin-bottom: 1.5rem; border-bottom: 1px solid #ddd; display: inline-block; padding: 0 2rem 1rem 2rem; min-width: 400px; font-family: 'Snell Roundhand', cursive;">
                    ${userName || 'Distinguished Learner'}
                </div>

                <p style="font-size: 1.2rem; color: #666; margin-bottom: 1rem; font-family: sans-serif;">Has successfully mastered the course</p>
                
                <h3 style="font-size: 2rem; color: #1f2937; margin: 0; font-weight: 700;">${courseTitle}</h3>
            </div>

            <!-- Footer -->
            <div style="width: 100%; display: flex; justify-content: space-between; margin-top: auto; padding-top: 2rem;">
                <div style="text-align: center;">
                    <div style="border-top: 1px solid #000; width: 200px; margin: 0 auto 0.5rem auto;"></div>
                    <p style="font-size: 0.9rem; color: #666; margin: 0; font-family: sans-serif;">Date: ${completionDate}</p>
                </div>
                
                 <div style="text-align: center;">
                    <img src="/signature_placeholder.png" onerror="this.style.display='none'" style="height: 40px; margin-bottom: -10px;"> 
                    <div style="border-top: 1px solid #000; width: 200px; margin: 0 auto 0.5rem auto;"></div>
                    <p style="font-size: 0.9rem; color: #666; margin: 0; font-family: sans-serif;">FSW Training Director</p>
                </div>
            </div>
            
            <div style="position: absolute; bottom: 10px; right: 20px; font-size: 0.7rem; color: #ccc; font-family: sans-serif;">
                ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}
            </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 1rem;">
            <button id="download-cert-btn" class="btn-primary" style="padding: 1rem 2rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>⬇️</span> Download Certificate
            </button>
            <button id="back-home-cert" style="padding: 1rem 2rem; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;">
                Return to Dashboard
            </button>
        </div>

        <script>
             // Logic injected via attached event listeners in parent
        </script>
    </div>
    `
}

export const downloadCertificate = async (elementId, fileName) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
        const canvas = await html2canvas(element, {
            scale: 2, // Higher quality
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [canvas.width, canvas.height]
        });

        // pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height); // Scaling might be weird with jsPDF logic
        // Simpler for now: Download as Image

        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = imgData;
        link.click();

        // If PDF is really needed we can switch, but high res PNG is usually great for certificates on web.
        // Let's stick to PNG for simplicity/robustness first, user said "download it".

    } catch (err) {
        console.error('Certificate download failed:', err);
        alert('Failed to generate certificate. Please try again.');
    }
}
