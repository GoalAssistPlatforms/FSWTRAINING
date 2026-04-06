import { processAndUploadGuide, chatWithGuides, fetchAllGuides, deleteGuide } from '../api/guides.js';

export const renderGuides = (user) => {
    return `
    <div class="guides-container fade-in" style="display: grid; grid-template-columns: 1fr 350px; gap: 2rem; min-height: 80vh;">
        
        <!-- Left: Search & Chat (RAG AI) -->
        <div class="glass" style="display: flex; flex-direction: column; padding: 2rem; border-radius: var(--radius-lg); height: 80vh;">
            <div style="margin-bottom: 2rem; text-align: center;">
                <h2 style="margin: 0 0 0.5rem 0; font-size: 2rem; color: white;">Ask FSW Digital Assistant</h2>
                <p style="margin: 0; color: var(--text-muted);">Have a question about HR, systems, or policies? Just ask.</p>
            </div>
            
            <div id="chat-history" style="flex: 1; overflow-y: auto; padding-right: 1rem; margin-bottom: 2rem; display: flex; flex-direction: column; gap: 1rem;">
                <div style="align-self: flex-start; max-width: 80%; background: rgba(255,255,255,0.05); padding: 1rem 1.5rem; border-radius: 20px; border-bottom-left-radius: 4px; color: white; border: 1px solid rgba(255,255,255,0.1);">
                    👋 Hello! I'm your digital team member. Ask me anything about our listed guides, policies, or standard operating procedures.
                </div>
            </div>

            <div style="position: relative;">
                <input type="text" id="chat-input" placeholder="e.g. How do I request annual leave?" style="width: 100%; padding: 1rem 3rem 1rem 1.5rem; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 30px; color: white; font-size: 1rem; outline: none; box-sizing: border-box; transition: border-color 0.3s;">
                <button id="send-chat-btn" style="position: absolute; right: 8px; top: 8px; bottom: 8px; padding: 0 1rem; background: var(--primary); border: none; border-radius: 20px; color: black; font-weight: bold; cursor: pointer;">Ask</button>
            </div>
        </div>

        <!-- Right: Document Library -->
        <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg); overflow-y: auto; height: 80vh;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; font-size: 1.2rem; color: white;">Company Guides</h3>
            </div>

            ${user.role === 'manager' ? `
            <div id="upload-zone" style="border: 2px dashed rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); border-radius: var(--radius-md); padding: 1.5rem; text-align: center; margin-bottom: 2rem; cursor: pointer; transition: all 0.3s;">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📄+</div>
                <div style="font-size: 0.9rem; color: var(--text-muted);">Click or drag PDF to add to Knowledge Base</div>
                <input type="file" id="guide-file-input" accept=".pdf" style="display: none;">
                <div id="upload-progress" style="margin-top: 1rem; font-size: 0.8rem; color: var(--primary); font-weight: bold; display: none;"></div>
            </div>
            ` : ''}

            <div id="guides-list" style="display: flex; flex-direction: column; gap: 1rem;">
                <!-- Filled dynamically -->
                <div style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">Loading documents...</div>
            </div>
        </div>
    </div>
    
    <style>
        #upload-zone:hover { border-color: var(--primary); background: rgba(255,255,255,0.05); }
        .source-link { display: inline-block; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; color: var(--primary); text-transform: uppercase; cursor: pointer; margin-top: 5px; }
        .source-link:hover { background: rgba(255,255,255,0.2); }
    </style>
    `
}

export const initGuidesEvents = async (user) => {
    const chatInput = document.getElementById('chat-input')
    const sendChatBtn = document.getElementById('send-chat-btn')
    const chatHistory = document.getElementById('chat-history')
    const guidesList = document.getElementById('guides-list')

    // Fetch and display guides
    const loadGuides = async () => {
        try {
            const guides = await fetchAllGuides()
            if (!guides || guides.length === 0) {
                guidesList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">No guides available yet.</div>`
                return
            }
            
            guidesList.innerHTML = guides.map(g => `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; display: flex; align-items: flex-start; justify-content: space-between;">
                   <div>
                       <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; color: white;">${g.title}</h4>
                       <div style="font-size: 0.75rem; color: var(--text-muted);">Added ${new Date(g.created_at).toLocaleDateString()}</div>
                   </div>
                   <div style="display: flex; gap: 0.5rem;">
                       ${g.file_url ? `<a href="${g.file_url}" target="_blank" style="background: rgba(255,255,255,0.1); border: none; padding: 4px 8px; border-radius: 4px; color: white; cursor: pointer; font-size: 0.8rem; text-decoration: none;">View</a>` : ''}
                       ${user.role === 'manager' ? `<button class="delete-guide-btn" data-id="${g.id}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); padding: 4px 8px; border-radius: 4px; color: white; cursor: pointer; font-size: 0.8rem;">X</button>` : ''}
                   </div>
                </div>
            `).join('')

            // Attach delete listeners
            if (user.role === 'manager') {
                document.querySelectorAll('.delete-guide-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        if (confirm('Delete this guide from the knowledge base?')) {
                            const id = e.target.dataset.id;
                            try {
                                await deleteGuide(id);
                                loadGuides();
                            } catch (err) {
                                alert("Failed to delete.");
                            }
                        }
                    })
                })
            }

        } catch (e) {
            console.error("Failed to load guides", e)
            guidesList.innerHTML = `<div style="color: #ef4444; font-size: 0.8rem;">Error loading guides</div>`
        }
    }

    loadGuides()

    // Manager Upload Logic
    if (user.role === 'manager') {
        const uploadZone = document.getElementById('upload-zone')
        const fileInput = document.getElementById('guide-file-input')
        const progressDiv = document.getElementById('upload-progress')

        uploadZone.addEventListener('click', () => fileInput.click())
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0]
            if (!file) return

            progressDiv.style.display = 'block'
            
            try {
                // Determine title from filename (remove .pdf)
                const title = file.name.replace(/\.[^/.]+$/, "")

                await processAndUploadGuide(file, title, 'PDF Handbook', (progressMsg) => {
                    progressDiv.innerText = progressMsg
                })
                
                progressDiv.innerText = "Upload successful!"
                progressDiv.style.color = "#10b981"
                setTimeout(() => { progressDiv.style.display = 'none'; progressDiv.style.color = "var(--primary)" }, 3000)
                
                loadGuides() // Refresh list

            } catch (err) {
                console.error("Upload error", err)
                progressDiv.innerText = "Error: " + err.message
                progressDiv.style.color = "#ef4444"
            }
            
            fileInput.value = '' // Reset
        })
    }

    // Chatbot Logic
    const appendMessage = (content, isUser = false, sources = []) => {
        const msgDiv = document.createElement('div')
        msgDiv.style.alignSelf = isUser ? 'flex-end' : 'flex-start'
        msgDiv.style.maxWidth = '80%'
        msgDiv.style.background = isUser ? 'var(--primary)' : 'rgba(255,255,255,0.05)'
        msgDiv.style.color = isUser ? 'black' : 'white'
        msgDiv.style.padding = '1rem 1.5rem'
        msgDiv.style.borderRadius = '20px'
        msgDiv.style.borderBottomRightRadius = isUser ? '4px' : '20px'
        msgDiv.style.borderBottomLeftRadius = isUser ? '20px' : '4px'
        msgDiv.style.border = isUser ? 'none' : '1px solid rgba(255,255,255,0.1)'
        msgDiv.style.lineHeight = '1.5'

        // Convert simple markdown and linebreaks for AI response
        const formattedContent = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        let sourceHtml = '';
        if (sources && sources.length > 0) {
            // Deduplicate sources by document
            const uniqueDocs = [...new Set(sources.map(s => s.document_title))];
            sourceHtml = `<div style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 8px;">` + 
                         uniqueDocs.map(title => `<span class="source-link">📄 ${title}</span>`).join(' ') +
                         `</div>`;
        }

        msgDiv.innerHTML = formattedContent + sourceHtml;
        chatHistory.appendChild(msgDiv)
        chatHistory.scrollTop = chatHistory.scrollHeight
    }

    const handleChat = async () => {
        const q = chatInput.value.trim()
        if (!q) return

        appendMessage(q, true)
        chatInput.value = ''
        
        // Show loading indicator
        const loadingDiv = document.createElement('div')
        loadingDiv.innerText = '...'
        loadingDiv.style.alignSelf = 'flex-start'
        loadingDiv.style.color = 'var(--text-muted)'
        loadingDiv.id = 'chat-loading'
        chatHistory.appendChild(loadingDiv)
        chatHistory.scrollTop = chatHistory.scrollHeight

        try {
            const result = await chatWithGuides(q)
            document.getElementById('chat-loading').remove()
            appendMessage(result.answer, false, result.sources)
        } catch (err) {
            console.error(err)
            document.getElementById('chat-loading').remove()
            appendMessage("I'm sorry, I'm having trouble accessing the knowledge base right now. Please try again later.", false)
        }
    }

    sendChatBtn.addEventListener('click', handleChat)
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChat()
    })
}
