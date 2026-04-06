import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Dynamically generates a certificate as a PDF download
 * @param {string} userName 
 * @param {string} courseName 
 * @param {Date|string} issueDate 
 * @param {Date|string|null} expiryDate 
 * @param {string} certificateId 
 */
export const downloadCertificate = async (userName, courseName, issueDate, expiryDate, certificateId) => {
    // 1. Create a hidden container
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.left = '-9999px' // Hide offscreen
    container.style.top = '-9999px'
    
    // We want a high-res wide certificate (A4 Landscape aspect ratio roughly: 297x210, so 1122x793 pixels @ 96dpi)
    const width = 1122
    const height = 793
    
    const formattedIssueDate = new Date(issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const formattedExpiryDate = expiryDate ? new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Never Expires'

    // HTML Template updated for perfect html2canvas compatibility
    container.innerHTML = `
        <div id="certificate-canvas" style="
            width: ${width}px; 
            height: ${height}px; 
            background-color: #0f172a;
            position: relative; 
            font-family: 'Inter', sans-serif;
            color: #ffffff;
            box-sizing: border-box;
            padding: 40px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <!-- Background Orbs -->
            <div style="position: absolute; top: -150px; right: -150px; width: 600px; height: 600px; background: radial-gradient(circle, rgba(14,165,233,0.3) 0%, transparent 70%); border-radius: 50%;"></div>
            <div style="position: absolute; bottom: -150px; left: -150px; width: 600px; height: 600px; background: radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%); border-radius: 50%;"></div>

            <!-- Main Content Container (Safe for html2canvas) -->
            <div style="
                width: 100%;
                height: 100%;
                position: relative;
                z-index: 10;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 50px;
                text-align: center;
                background-color: #1e293b; /* Solid dark fallback */
                border: 2px solid rgba(14, 165, 233, 0.5);
                border-radius: 20px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            ">
                
                <!-- FSW Official Badge -->
                <div style="margin-bottom: 25px; display: flex; justify-content: center;">
                    <div style="
                        background: #ffffff;
                        padding: 12px 24px;
                        border-radius: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    ">
                        <img src="/fsw_logo_brand.png" style="height: 64px; width: auto; object-fit: contain;" crossorigin="anonymous" />
                    </div>
                </div>

                <!-- Typography Upgrade -->
                <h1 style="font-size: 16px; color: #38bdf8; font-weight: 700; text-transform: uppercase; letter-spacing: 6px; margin: 0 0 15px 0;">
                    Official Certification
                </h1>
                
                <h2 style="font-size: 60px; font-weight: 800; margin: 0 0 40px 0; font-family: 'Times New Roman', Times, serif; font-style: italic; color: #ffffff;">
                    Certificate of Completion
                </h2>
                
                <p style="font-size: 16px; color: #94a3b8; margin: 0 0 10px 0; font-weight: 600; letter-spacing: 2px;">
                    THIS PROUDLY ACKNOWLEDGES THAT
                </p>
                
                <div style="margin: 0 0 30px 0; border-bottom: 2px solid rgba(14, 165, 233, 0.4); padding-bottom: 15px; min-width: 500px; display: inline-block;">
                    <h3 style="font-size: 48px; color: #ffffff; margin: 0; font-weight: 700; letter-spacing: 1px;">
                        ${userName}
                    </h3>
                </div>
                
                <p style="font-size: 16px; color: #94a3b8; margin: 0 0 20px 0; font-weight: 600; letter-spacing: 2px;">
                    HAS SUCCESSFULLY COMPLETED THE TRAINING COURSE
                </p>
                
                <h4 style="font-size: 36px; color: #38bdf8; margin: 0 0 40px 0; font-weight: 600; max-width: 80%; line-height: 1.3;">
                    "${courseName}"
                </h4>
                
                <!-- Footer Info Block -->
                <div style="display: flex; justify-content: space-between; width: 100%; margin-top: auto; padding: 20px 30px 0; align-items: flex-end; border-top: 1px solid rgba(255,255,255,0.1);">
                    
                    <div style="text-align: left; width: 33%;">
                        <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Date Issued</div>
                        <div style="font-size: 20px; font-weight: 600; color: #e2e8f0; font-family: monospace;">${formattedIssueDate}</div>
                    </div>
                    
                    <div style="text-align: center; width: 34%;">
                        <div style="font-family: monospace; font-size: 14px; color: #94a3b8; padding: 6px 12px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-bottom: 5px; display: inline-block;">
                            ID: <span style="color: #ffffff;">${certificateId.split('-')[0].toUpperCase()}-${certificateId.split('-')[1].toUpperCase()}</span>
                        </div>
                        <div style="font-size: 10px; color: #64748b; letter-spacing: 1px; text-transform: uppercase;">Verified Credential</div>
                    </div>

                    <div style="text-align: right; width: 33%;">
                        <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Valid Until</div>
                        <div style="font-size: 20px; font-weight: 600; color: ${expiryDate ? '#f43f5e' : '#10b981'}; font-family: monospace;">${formattedExpiryDate}</div>
                    </div>

                </div>
            </div>
        </div>
    `
    document.body.appendChild(container)

    try {
        const sourceElement = document.getElementById('certificate-canvas')
        
        // Render element to canvas
        const canvas = await html2canvas(sourceElement, {
            scale: 2, // High resolution
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#0f172a'
        })
        
        const imgData = canvas.toDataURL('image/png')
        
        // Calculate aspect ratio for jsPDF (A4 Landscape)
        // A4 physical dimensions: 297mm x 210mm
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        })

        pdf.addImage(imgData, 'PNG', 0, 0, 297, 210)
        
        // Trigger download
        const safeName = courseName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        pdf.save(`FSW_Certificate_${safeName}.pdf`)
        
    } catch (error) {
        console.error('Error generating certificate:', error)
        throw error
    } finally {
        // Cleanup DOM
        document.body.removeChild(container)
    }
}
