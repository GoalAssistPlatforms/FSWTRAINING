// src/utils/dialog.js

function createDialogHTML(type, message, title, defaultValue = '') {
    const isPrompt = type === 'prompt';
    const isConfirm = type === 'confirm' || type === 'prompt';

    return `
        <div id="fsw-dialog-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 100000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255,255,255,0.15); border-radius: var(--radius-lg); width: 90%; max-width: 400px; padding: 1.5rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                ${title ? `<h3 style="margin: 0 0 1rem 0; color: #fff; font-size: 1.2rem;">${title}</h3>` : ''}
                <div style="color: rgba(255,255,255,0.85); font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; margin-bottom: 1.5rem;">${message}</div>
                ${isPrompt ? `<input type="text" id="fsw-dialog-input" value="${defaultValue}" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px; color: white; margin-bottom: 1.5rem;" autocomplete="off" />` : ''}
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    ${isConfirm ? `<button id="fsw-dialog-cancel" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); padding: 8px 16px; border-radius: 6px; cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">Cancel</button>` : ''}
                    <button id="fsw-dialog-ok" class="btn-primary" style="padding: 8px 16px; min-width: 80px;">OK</button>
                </div>
            </div>
        </div>
    `;
}

function showDialog(type, message, title = '', defaultValue = '') {
    return new Promise((resolve) => {
        const existing = document.getElementById('fsw-dialog-overlay');
        if (existing) existing.remove();

        const html = createDialogHTML(type, message, title, defaultValue);
        document.body.insertAdjacentHTML('beforeend', html);

        const overlay = document.getElementById('fsw-dialog-overlay');
        const btnOk = document.getElementById('fsw-dialog-ok');
        const btnCancel = document.getElementById('fsw-dialog-cancel');
        const input = document.getElementById('fsw-dialog-input');

        if (input) {
            input.focus();
            // Move cursor to end
            input.selectionStart = input.selectionEnd = input.value.length;
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') btnOk.click();
            });
        } else {
            btnOk.focus();
        }
        
        // Handle global Enter key for alert/confirm
        const handleGlobalKey = (e) => {
            if (e.key === 'Enter' && !input && document.activeElement !== btnCancel && document.activeElement !== btnOk) {
                btnOk.click();
            }
        };
        document.addEventListener('keydown', handleGlobalKey);

        const cleanup = () => {
            if (overlay) overlay.remove();
            document.removeEventListener('keydown', handleGlobalKey);
        };

        btnOk.onclick = () => {
            cleanup();
            if (type === 'prompt') resolve(input.value);
            else if (type === 'confirm') resolve(true);
            else resolve();
        };

        if (btnCancel) {
            btnCancel.onclick = () => {
                cleanup();
                if (type === 'prompt') resolve(null);
                else resolve(false);
            };
        }
    });
}

export function fswAlert(message, title = 'Notification') {
    return showDialog('alert', message, title);
}

export function fswConfirm(message, title = 'Confirm Action') {
    return showDialog('confirm', message, title);
}

export function fswPrompt(message, defaultValue = '', title = 'Input Required') {
    return showDialog('prompt', message, title, defaultValue);
}
