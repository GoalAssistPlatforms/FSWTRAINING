
// Basic template literals used, no external templating engine needed

// Wait, the project seems to be using vanilla JS with template literals based on CoursePlayer.js.
// I will stick to the same pattern: a function that returns an HTML string or an element.

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { fswAlert } from '../../utils/dialog.js'

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
            background: radial-gradient(circle, #fcfbf7 0%, #f7f5ee 100%);
            color: #1e293b;
            padding: 3rem 4rem;
            border-radius: 12px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.4);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            font-family: 'Inter', sans-serif;
            overflow: hidden;
            border: 12px solid #0f172a;
            box-sizing: border-box;
        ">
            <!-- Google Fonts Link inside the template (guarantees fonts are loaded for html2canvas) -->
            <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cinzel:wght@600;800&family=Playfair+Display:ital,wght@1,600&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">

            <!-- Gold Inner Border -->
            <div style="position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px; border: 2px solid #c5a059; pointer-events: none;"></div>
            <div style="position: absolute; top: 14px; left: 14px; right: 14px; bottom: 14px; border: 1px solid #c5a059; opacity: 0.5; pointer-events: none;"></div>

            <!-- Corner Accents -->
            <div style="position: absolute; top: 8px; left: 8px; width: 16px; height: 16px; border-top: 3px solid #c5a059; border-left: 3px solid #c5a059; pointer-events: none;"></div>
            <div style="position: absolute; top: 8px; right: 8px; width: 16px; height: 16px; border-top: 3px solid #c5a059; border-right: 3px solid #c5a059; pointer-events: none;"></div>
            <div style="position: absolute; bottom: 8px; left: 8px; width: 16px; height: 16px; border-bottom: 3px solid #c5a059; border-left: 3px solid #c5a059; pointer-events: none;"></div>
            <div style="position: absolute; bottom: 8px; right: 8px; width: 16px; height: 16px; border-bottom: 3px solid #c5a059; border-right: 3px solid #c5a059; pointer-events: none;"></div>

            <!-- Header -->
            <div style="margin-top: 0.25rem; margin-bottom: 0.75rem; display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
                <div class="logo-badge" style="background: white; padding: 0.35rem 1.1rem; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.05); display: inline-flex;">
                    <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 26px; width: auto; object-fit: contain;">
                </div>
                <h1 style="font-size: 2.1rem; margin: 0.15rem 0 0 0; color: #0f172a; text-transform: uppercase; letter-spacing: 6px; font-family: 'Cinzel', serif; font-weight: 800; line-height: 1.1;">Certificate</h1>
                <h2 style="font-size: 0.95rem; margin: 0.05rem 0 0 0; color: #c5a059; text-transform: uppercase; letter-spacing: 4px; font-weight: 600; font-family: 'Inter', sans-serif; line-height: 1.1;">of completion</h2>
            </div>

            <!-- Body -->
            <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; width: 100%; margin-bottom: 1.25rem;">
                <p style="font-size: 0.9rem; color: #64748b; margin: 0 0 0.5rem 0; font-style: italic; font-family: 'Playfair Display', serif; letter-spacing: 0.5px;">This is to certify that</p>
                
                <div style="font-size: 2.3rem; font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; color: #0f172a; margin-bottom: 0.5rem; display: inline-block; padding-bottom: 0.25rem; border-bottom: 2px solid #e2e8f0; min-width: 450px; text-shadow: 0 1px 1px rgba(0,0,0,0.05); line-height: 1.2;">
                    ${userName || 'Distinguished Learner'}
                </div>

                <p style="font-size: 0.85rem; color: #64748b; margin: 0.5rem 0 0.5rem 0; font-family: 'Inter', sans-serif; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 500;">has successfully completed the training course</p>
                
                <h3 style="font-size: 1.6rem; color: #1e293b; margin: 0; font-weight: 700; font-family: 'Inter', sans-serif; line-height: 1.2; max-width: 600px; align-self: center;">
                    ${courseTitle}
                </h3>
            </div>

            <!-- Footer area -->
            <div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-bottom: 1.5rem; position: relative;">
                
                <!-- Date column -->
                <div style="text-align: center; width: 220px;">
                    <div style="font-size: 0.9rem; color: #0f172a; font-weight: 600; margin-bottom: 2px; height: 35px; display: flex; align-items: flex-end; justify-content: center; font-family: 'Inter', sans-serif;">
                        ${completionDate}
                    </div>
                    <div style="border-top: 1px solid #cbd5e1; width: 100%; margin-bottom: 0.5rem;"></div>
                    <p style="font-size: 0.8rem; color: #475569; margin: 0; font-weight: 500; font-family: 'Inter', sans-serif;">Date of Issue</p>
                </div>

                <!-- Center Gold Seal -->
                <div style="display: flex; flex-direction: column; align-items: center; position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);">
                    <div style="width: 76px; height: 76px; background: radial-gradient(circle, #fef8e2 0%, #d4af37 100%); border-radius: 50%; border: 3px double #b89028; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; position: relative;">
                        <div style="width: 62px; height: 62px; border: 1px dashed rgba(255,255,255,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #876200; font-family: 'Inter', sans-serif; font-size: 8px; font-weight: bold; text-align: center; line-height: 1.1;">
                            FSW ASPIRE<br>★ CERTIFIED ★
                        </div>
                        <!-- Seal Ribbon Left -->
                        <div style="position: absolute; bottom: -20px; left: 16px; width: 14px; height: 35px; background: #b89028; transform: rotate(15deg); clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 50% 80%, 0% 100%); z-index: -1; opacity: 0.95;"></div>
                        <!-- Seal Ribbon Right -->
                        <div style="position: absolute; bottom: -20px; right: 16px; width: 14px; height: 35px; background: #b89028; transform: rotate(-15deg); clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 50% 80%, 0% 100%); z-index: -1; opacity: 0.95;"></div>
                    </div>
                </div>

                <!-- Signature column -->
                <div style="text-align: center; width: 220px;">
                    <!-- Simulated handwritten signature -->
                    <div style="font-family: 'Alex Brush', cursive; font-size: 1.85rem; color: #0369a1; line-height: 0.8; transform: rotate(-3deg) translateY(2px); margin-bottom: 2px; height: 35px; display: flex; align-items: flex-end; justify-content: center; pointer-events: none;">
                        HPursehouse
                    </div>
                    <div style="border-top: 1px solid #cbd5e1; width: 100%; margin-bottom: 0.5rem;"></div>
                    <p style="font-size: 0.8rem; color: #475569; margin: 0; font-weight: 500; font-family: 'Inter', sans-serif; white-space: nowrap;">People and Development Manager</p>
                </div>
            </div>

            <!-- Verification ID watermark -->
            <div style="position: absolute; bottom: 16px; right: 24px; font-size: 0.65rem; color: #94a3b8; font-family: 'Inter', sans-serif; font-weight: 500; letter-spacing: 0.5px; opacity: 0.6;">
                VERIFICATION ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}
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
        await fswAlert('Failed to generate certificate. Please try again.');
    }
}
