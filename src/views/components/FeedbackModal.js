import { submitFeedback, getAllFeedback } from '../../api/feedback.js';

export const renderFeedbackModal = () => {
    return `
    <div id="feedback-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; justify-content: center; align-items: center; backdrop-filter: blur(10px);">
        <div class="glass" style="background: rgba(20, 20, 25, 0.95); width: 600px; max-width: 90%; border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; max-height: 85vh; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); overflow: hidden;">
            
            <!-- Modal Header with Tab Navigation -->
            <div style="padding: 1.5rem; background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: white; font-size: 1.4rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;"><span>💬</span> FSW Feedback Hub</h3>
                    <button id="close-feedback-modal" style="background: none; border: none; color: var(--text-muted); font-size: 1.8rem; cursor: pointer; padding: 0; line-height: 1; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='var(--text-muted)'">&times;</button>
                </div>
                
                <!-- Navigation Tabs -->
                <div style="display: flex; gap: 0.5rem; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.05);">
                    <button id="tab-write-feedback" class="active" style="flex: 1; padding: 0.6rem; border: none; border-radius: 25px; background: var(--primary); color: black; font-weight: bold; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 0.3rem;">Share Feedback</button>
                    <button id="tab-view-catalogue" style="flex: 1; padding: 0.6rem; border: none; border-radius: 25px; background: transparent; color: white; font-weight: bold; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 0.3rem;">Action Catalogue</button>
                </div>
            </div>

            <!-- Tab Content 1: Write Feedback -->
            <div id="content-write-feedback" style="padding: 2rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 2.2rem;">
                
                <!-- Type Selection -->
                <div>
                    <label style="color: white; display: block; margin-bottom: 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1.5px; font-weight: bold; border-left: 2px solid var(--primary); padding-left: 0.6rem;">Select Feedback Type</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                        <button class="feedback-type-btn" data-type="positive" style="background: rgba(255, 255, 255, 0.02); border: 2px solid rgba(255,255,255,0.1); padding: 1.25rem 0.5rem; border-radius: 12px; color: white; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; font-weight: bold; transition: all 0.2s;">
                            <span style="font-size: 1.8rem;">⭐</span>
                            <span style="font-size: 0.8rem;">Positive / Testimonial</span>
                        </button>
                        
                        <button class="feedback-type-btn active" data-type="negative" style="background: rgba(59, 130, 246, 0.05); border: 2px solid #3b82f6; padding: 1.25rem 0.5rem; border-radius: 12px; color: white; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; font-weight: bold; transition: all 0.2s; box-shadow: 0 0 15px rgba(59, 130, 246, 0.25);">
                            <span style="font-size: 1.8rem;">💡</span>
                            <span style="font-size: 0.8rem;">Product Improvement</span>
                        </button>
                        
                        <button class="feedback-type-btn" data-type="urgent" style="background: rgba(255, 255, 255, 0.02); border: 2px solid rgba(255,255,255,0.1); padding: 1.25rem 0.5rem; border-radius: 12px; color: white; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; font-weight: bold; transition: all 0.2s;">
                            <span style="font-size: 1.8rem;">🚨</span>
                            <span style="font-size: 0.8rem;">Urgent System Error</span>
                        </button>
                    </div>
                </div>

                <!-- Input Text -->
                <div>
                    <label style="color: white; display: block; margin-bottom: 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1.5px; font-weight: bold; border-left: 2px solid var(--primary); padding-left: 0.6rem;">Tell us what you think</label>
                    <textarea id="feedback-text" placeholder="Write your message here... Detailed descriptions help us act faster!" style="width: 100%; height: 120px; box-sizing: border-box; padding: 1.2rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.4); color: white; outline: none; font-family: inherit; font-size: 1rem; resize: vertical; line-height: 1.5; transition: border-color 0.2s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'"></textarea>
                </div>

                <!-- Screenshot Attachment -->
                <div>
                    <label style="color: white; display: block; margin-bottom: 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1.5px; font-weight: bold; border-left: 2px solid var(--primary); padding-left: 0.6rem;">Attach Screenshot (Optional)</label>
                    <div style="display: flex; gap: 1rem; align-items: center;">
                        <div id="fb-screenshot-zone" style="flex: 1; border: 2px dashed rgba(255,255,255,0.2); border-radius: 12px; padding: 1.2rem; text-align: center; cursor: pointer; transition: all 0.3s; background: rgba(0,0,0,0.3);" onmouseover="this.style.borderColor='var(--primary)'; this.style.background='rgba(0,0,0,0.45)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.background='rgba(0,0,0,0.3)';">
                            <span style="font-size: 1.2rem; margin-right: 0.5rem;">📸</span>
                            <span id="fb-screenshot-label" style="font-size: 0.85rem; color: var(--text-muted);">Choose an image or drag here...</span>
                            <input type="file" id="fb-screenshot-input" accept="image/*" style="display: none;">
                        </div>
                        <div id="fb-screenshot-preview-container" style="display: none; width: 60px; height: 60px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); overflow: hidden; position: relative;">
                            <img id="fb-screenshot-preview" style="width: 100%; height: 100%; object-fit: cover;">
                            <button id="fb-remove-screenshot" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.8); border: none; border-radius: 50%; color: white; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 9px; cursor: pointer;">&times;</button>
                        </div>
                    </div>
                </div>

                <!-- Action Button -->
                <button id="submit-feedback-btn" class="btn-primary" style="width: 100%; padding: 1rem; border-radius: 8px; font-weight: bold; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.3);">
                    Submit Feedback
                </button>
            </div>

            <!-- Tab Content 2: Catalogue -->
            <div id="content-view-catalogue" style="padding: 2rem; overflow-y: auto; flex: 1; display: none; flex-direction: column; gap: 1.2rem;">
                <div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">
                    See how your feedback is being reviewed and resolved by the Altius Insight Team in real-time.
                </div>
                <div id="catalogue-list" style="display: flex; flex-direction: column; gap: 1rem;">
                    <!-- Dynamically populated -->
                </div>
            </div>

        </div>
    </div>

    <style>
        .feedback-type-btn {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .feedback-type-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
            filter: brightness(1.2);
        }
        .feedback-type-btn:active {
            transform: translateY(-1px);
        }
        #feedback-text {
            transition: border-color 0.25s ease, box-shadow 0.25s ease !important;
        }
        #feedback-text:focus {
            box-shadow: 0 0 15px rgba(18, 142, 205, 0.15) !important;
        }
        #fb-screenshot-zone {
            transition: all 0.3s ease !important;
        }
        #fb-screenshot-zone:hover {
            box-shadow: 0 0 15px rgba(18, 142, 205, 0.1) !important;
        }
        #submit-feedback-btn {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        #submit-feedback-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(18, 142, 205, 0.4) !important;
        }
        #submit-feedback-btn:active {
            transform: translateY(0);
    </style>
    `;
};

export const initFeedbackEvents = () => {
    const modal = document.getElementById('feedback-modal');
    const closeBtn = document.getElementById('close-feedback-modal');
    const tabWrite = document.getElementById('tab-write-feedback');
    const tabView = document.getElementById('tab-view-catalogue');
    const contentWrite = document.getElementById('content-write-feedback');
    const contentView = document.getElementById('content-view-catalogue');
    
    const screenshotZone = document.getElementById('fb-screenshot-zone');
    const screenshotInput = document.getElementById('fb-screenshot-input');
    const screenshotLabel = document.getElementById('fb-screenshot-label');
    const previewContainer = document.getElementById('fb-screenshot-preview-container');
    const previewImg = document.getElementById('fb-screenshot-preview');
    const removeScreenshotBtn = document.getElementById('fb-remove-screenshot');

    const feedbackText = document.getElementById('feedback-text');
    const submitBtn = document.getElementById('submit-feedback-btn');
    const typeButtons = document.querySelectorAll('.feedback-type-btn');
    const catalogueList = document.getElementById('catalogue-list');

    let selectedType = 'negative'; // Default
    let attachedFile = null;

    // Toggle Modal
    const closeModal = () => {
        modal.style.display = 'none';
        // Reset fields
        feedbackText.value = '';
        attachedFile = null;
        screenshotInput.value = '';
        previewContainer.style.display = 'none';
        previewImg.src = '';
        screenshotLabel.innerText = 'Choose an image or drag here...';
        submitBtn.innerHTML = `Submit Feedback`;
        submitBtn.disabled = false;
    };
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Tab Navigation
    tabWrite.addEventListener('click', () => {
        tabWrite.className = 'active';
        tabWrite.style.background = 'var(--primary)';
        tabWrite.style.color = 'black';
        
        tabView.className = '';
        tabView.style.background = 'transparent';
        tabView.style.color = 'white';

        contentWrite.style.display = 'flex';
        contentView.style.display = 'none';
    });

    tabView.addEventListener('click', async () => {
        tabView.className = 'active';
        tabView.style.background = 'var(--primary)';
        tabView.style.color = 'black';
        
        tabWrite.className = '';
        tabWrite.style.background = 'transparent';
        tabWrite.style.color = 'white';

        contentWrite.style.display = 'none';
        contentView.style.display = 'flex';

        await loadCatalogue();
    });

    // Type Selector Buttons
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => {
                b.classList.remove('active');
                b.style.borderColor = 'rgba(255,255,255,0.1)';
                b.style.background = 'rgba(255,255,255,0.02)';
                b.style.boxShadow = 'none';
            });
            selectedType = btn.dataset.type;
            btn.classList.add('active');
            
            let activeColor = '#3b82f6'; // Improvement (blue)
            if (selectedType === 'positive') activeColor = '#10b981'; // Green
            if (selectedType === 'urgent') activeColor = '#ef4444'; // Red

            btn.style.borderColor = activeColor;
            btn.style.background = `${activeColor}10`; // Transparent background
            btn.style.boxShadow = `0 0 15px ${activeColor}40`; // Glowing focus outline
        });
    });

    // Screenshot Uploader Input triggers
    screenshotZone.addEventListener('click', () => screenshotInput.click());
    screenshotInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            attachedFile = file;
            screenshotLabel.innerText = file.name;
            
            // Create preview URL
            const previewUrl = URL.createObjectURL(file);
            previewImg.src = previewUrl;
            previewContainer.style.display = 'block';
        }
    });

    // Remove screenshot
    removeScreenshotBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        attachedFile = null;
        screenshotInput.value = '';
        previewContainer.style.display = 'none';
        previewImg.src = '';
        screenshotLabel.innerText = 'Choose an image or drag here...';
    });

    // Submit Feedback Action
    submitBtn.addEventListener('click', async () => {
        const message = feedbackText.value.trim();
        if (!message) {
            alert("Please type a message before submitting.");
            return;
        }

        const origHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span>🔄</span> Submitting feedback...`;
        submitBtn.disabled = true;

        try {
            await submitFeedback(selectedType, message, attachedFile);
            
            // Successful Notification
            submitBtn.innerHTML = `<span>✓</span> Submitted Successfully!`;
            submitBtn.style.background = '#10b981';
            submitBtn.style.color = 'white';

            setTimeout(() => {
                submitBtn.style.background = '';
                submitBtn.style.color = '';
                closeModal();
            }, 1500);

        } catch (e) {
            console.error(e);
            alert("Failed to submit feedback: " + (e.message || "Unknown error"));
            submitBtn.innerHTML = origHtml;
            submitBtn.disabled = false;
        }
    });

    // Load Resolution Catalogue
    async function loadCatalogue() {
        catalogueList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading catalogue...</div>';
        try {
            const feedbacks = await getAllFeedback();
            // Filter to resolved, acting-on or under-review status to keep uploader context
            const activeFeedbacks = feedbacks.filter(f => f.status === 'resolved' || f.status === 'acting-on' || f.status === 'under-review');
            
            if (activeFeedbacks.length === 0) {
                catalogueList.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 3rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                        📋 No resolved or active updates listed yet. Checked feedback will show up here.
                    </div>
                `;
                return;
            }

            catalogueList.innerHTML = activeFeedbacks.map(f => {
                const isPositive = f.type === 'positive';
                const isUrgent = f.type === 'urgent';
                let typeBadge = '💡 Improvement';
                let badgeColor = '#3b82f6';
                if (isPositive) { typeBadge = '⭐ Positive'; badgeColor = '#10b981'; }
                if (isUrgent) { typeBadge = '🚨 Urgent Error'; badgeColor = '#ef4444'; }

                let statusBadge = 'Under Review';
                let statusColor = '#3b82f6';
                if (f.status === 'acting-on') { statusBadge = '🛠️ Acting On'; statusColor = '#f59e0b'; }
                if (f.status === 'resolved') { statusBadge = '✓ Resolved'; statusColor = '#10b981'; }

                return `
                <div class="glass" style="padding: 1.2rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 0.8rem; background: rgba(255,255,255,0.01);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: ${badgeColor}20; border: 1px solid ${badgeColor}; color: ${badgeColor}; font-weight: bold;">${typeBadge}</span>
                        <span style="font-size: 0.75rem; font-weight: bold; color: ${statusColor};">${statusBadge}</span>
                    </div>
                    <div style="color: white; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">"${f.content}"</div>
                    
                    ${f.admin_response ? `
                        <div style="background: rgba(255, 255, 255, 0.03); padding: 0.8rem 1rem; border-radius: 6px; border-left: 3px solid var(--primary); font-size: 0.85rem;">
                            <strong style="color: var(--primary); display: block; margin-bottom: 0.25rem;">Admin Response:</strong>
                            <span style="color: #cbd5e1; line-height: 1.4;">${f.admin_response}</span>
                        </div>
                    ` : ''}
                </div>
                `;
            }).join('');

        } catch (e) {
            catalogueList.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 2rem;">Error loading catalogue: ${e.message}</div>`;
        }
    }
};
