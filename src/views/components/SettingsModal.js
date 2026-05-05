import { updateUserProfile } from '../../api/auth';
import { fswAlert } from '../../utils/dialog';

export function renderSettingsModal(user) {
    return `
        <div id="settings-modal" class="hidden" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg); width: 400px; max-width: 90vw; position: relative;">
                <button id="close-settings-modal" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.5rem; border-radius: 5px; transition: all 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='var(--text-muted)'">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <h3 style="margin-top: 0; margin-bottom: 1.5rem;">Profile Settings</h3>
                
                <form id="settings-form" style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Email Address (Read Only)</label>
                        <input type="text" value="${user.email}" disabled class="input-base" style="width: 100%; background: rgba(255,255,255,0.05); color: var(--text-muted);">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Full Name</label>
                        <input type="text" id="settings-fullname" value="${user.full_name || ''}" class="input-base" style="width: 100%;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Department</label>
                        <input type="text" id="settings-department" value="${user.department || ''}" class="input-base" style="width: 100%;">
                    </div>
                    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 0.5rem 0;">
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">New Password (leave blank to keep current)</label>
                        <input type="password" id="settings-password" placeholder="Enter new password" class="input-base" style="width: 100%;">
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                        <button type="button" class="btn-ghost" id="cancel-settings">Cancel</button>
                        <button type="submit" class="btn-primary" id="save-settings">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

export function initSettingsEvents(user) {
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('close-settings-modal');
    const cancelBtn = document.getElementById('cancel-settings');
    const form = document.getElementById('settings-form');
    const saveBtn = document.getElementById('save-settings');

    const closeModal = () => {
        modal.style.display = 'none';
        // Reset password field on close
        document.getElementById('settings-password').value = '';
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('settings-fullname').value;
            const department = document.getElementById('settings-department').value;
            const newPassword = document.getElementById('settings-password').value;

            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;

            try {
                // Determine what needs to be updated
                const updates = {};
                if (fullName !== user.full_name) updates.fullName = fullName;
                if (department !== user.department) updates.department = department;

                // Update Profile Details
                if (Object.keys(updates).length > 0) {
                    await updateUserProfile(user.id, updates);
                }

                // Update Password if provided
                if (newPassword && newPassword.trim() !== '') {
                    // Import updatePassword here to avoid circular dependency if auth.js has issues
                    const { updatePassword } = await import('../../api/auth');
                    await updatePassword(newPassword);
                }

                await fswAlert('Profile updated successfully!');
                closeModal();
                
                // If the user changed their name/department, reloading is best to refresh the UI state
                if (Object.keys(updates).length > 0) {
                    window.location.reload();
                }

            } catch (error) {
                console.error(error);
                await fswAlert(error.message || 'Failed to update profile.');
            } finally {
                saveBtn.textContent = 'Save Changes';
                saveBtn.disabled = false;
            }
        });
    }
}
