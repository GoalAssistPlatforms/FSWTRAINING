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

    // HTML Template matching FSW dark/neon
    container.innerHTML = `
        <div id="certificate-canvas" style="
            width: ${width}px; 
            height: ${height}px; 
            background: #0f172a; 
            position: relative; 
            font-family: 'Inter', sans-serif;
            color: #ffffff;
            box-sizing: border-box;
            padding: 40px;
            overflow: hidden;
            display: flex;
        ">
            <!-- Background glow effects -->
            <div style="position: absolute; top: -200px; left: -200px; width: 600px; height: 600px; background: radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 70%); border-radius: 50%;"></div>
            <div style="position: absolute; bottom: -300px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%); border-radius: 50%;"></div>
            
            <!-- Neon Border Wrapper -->
            <div style="
                border: 2px solid rgba(14,165,233,0.4); 
                box-shadow: 0 0 20px rgba(14,165,233,0.2), inset 0 0 20px rgba(139,92,246,0.2);
                border-radius: 20px;
                width: 100%;
                height: 100%;
                position: relative;
                z-index: 10;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 40px;
                text-align: center;
                background: rgba(15,23,42,0.6);
                backdrop-filter: blur(10px);
            ">
                
                <!-- Logo -->
                <div style="margin-bottom: 30px;">
                    <div style="
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 80px;
                        height: 80px;
                        border-radius: 16px;
                        background: linear-gradient(135deg, #0ea5e9, #8b5cf6);
                        color: white;
                        font-weight: 800;
                        font-size: 32px;
                        letter-spacing: 2px;
                        box-shadow: 0 10px 25px rgba(14,165,233,0.5);
                    ">
                        FSW
                    </div>
                </div>

                <h1 style="font-size: 56px; font-weight: 800; margin: 0; background: linear-gradient(to right, #ffffff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 2px; text-transform: uppercase;">
                    Certificate of Completion
                </h1>
                
                <p style="font-size: 24px; color: #94a3b8; margin: 30px 0 10px 0; font-weight: 500;">
                    This acknowledges that
                </p>
                
                <h2 style="font-size: 48px; color: #0ea5e9; margin: 0 0 30px 0; font-weight: 700; border-bottom: 2px solid rgba(14,165,233,0.3); padding-bottom: 10px; display: inline-block; min-width: 400px; text-shadow: 0 0 20px rgba(14,165,233,0.3);">
                    ${userName}
                </h2>
                
                <p style="font-size: 24px; color: #94a3b8; margin: 0 0 20px 0; font-weight: 500;">
                    has successfully completed the training course
                </p>
                
                <h3 style="font-size: 36px; color: #ffffff; margin: 0 0 50px 0; font-weight: 600; text-transform: capitalize; max-width: 80%;">
                    "${courseName}"
                </h3>
                
                <!-- Footer data -->
                <div style="display: flex; justify-content: space-between; width: 100%; margin-top: auto; padding: 0 40px; align-items: flex-end;">
                    
                    <div style="text-align: left;">
                        <div style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Issue Date</div>
                        <div style="font-size: 20px; font-weight: 600; color: #e2e8f0;">${formattedIssueDate}</div>
                    </div>
                    
                    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px; width: 250px;">
                        <div style="font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #94a3b8; margin-bottom: 5px;">ID: ${certificateId.split('-')[0].toUpperCase()}-${certificateId.split('-')[1].toUpperCase()}</div>
                        <div style="font-size: 12px; color: #64748b;">Official FSW Automated Validation</div>
                    </div>

                    <div style="text-align: right;">
                        <div style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Valid Until</div>
                        <div style="font-size: 20px; font-weight: 600; color: ${expiryDate ? '#f43f5e' : '#10b981'};">${formattedExpiryDate}</div>
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
