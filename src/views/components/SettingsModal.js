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
                    <h4 style="margin-top: 0; margin-bottom: 0.5rem; font-size: 1rem;">Personal Information</h4>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Profile Picture</label>
                        <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
                            <img id="settings-avatar-preview" src="${user.user_metadata?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.full_name || 'User')}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
                            <input type="file" id="settings-avatar" accept="image/*" class="input-base" style="width: 100%;">
                        </div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Email Address (Read Only)</label>
                        <input type="text" value="${user.email}" disabled class="input-base" style="width: 100%; background: rgba(255,255,255,0.05); color: var(--text-muted);">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Full Name</label>
                        <input type="text" id="settings-fullname" value="${user.full_name || user.user_metadata?.full_name || ''}" class="input-base" style="width: 100%;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Department</label>
                            <input type="text" id="settings-department" value="${user.department || user.user_metadata?.department || ''}" class="input-base" style="width: 100%;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Job Title</label>
                            <input type="text" id="settings-jobtitle" value="${user.user_metadata?.job_title || ''}" class="input-base" style="width: 100%;">
                        </div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Phone Number</label>
                        <input type="tel" id="settings-phone" value="${user.user_metadata?.phone || ''}" class="input-base" style="width: 100%;">
                    </div>
                    
                    <h4 style="margin-top: 1rem; margin-bottom: 0.5rem; font-size: 1rem;">Security Settings</h4>
                    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 0 0 1rem 0;">
                    
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Current Password (required to change password)</label>
                        <input type="password" id="settings-current-password" placeholder="Enter current password" class="input-base" style="width: 100%;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">New Password</label>
                            <input type="password" id="settings-password" placeholder="Enter new password" class="input-base" style="width: 100%;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Confirm New Password</label>
                            <input type="password" id="settings-confirm-password" placeholder="Confirm new password" class="input-base" style="width: 100%;">
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                        <input type="checkbox" id="settings-show-passwords" style="cursor: pointer;">
                        <label for="settings-show-passwords" style="color: var(--text-muted); font-size: 0.8rem; cursor: pointer;">Show Passwords</label>
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
        document.getElementById('settings-current-password').value = '';
        document.getElementById('settings-password').value = '';
        document.getElementById('settings-confirm-password').value = '';
        const showPassCheckbox = document.getElementById('settings-show-passwords');
        if (showPassCheckbox) {
            showPassCheckbox.checked = false;
            document.getElementById('settings-current-password').type = 'password';
            document.getElementById('settings-password').type = 'password';
            document.getElementById('settings-confirm-password').type = 'password';
        }
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    const avatarInput = document.getElementById('settings-avatar');
    const avatarPreview = document.getElementById('settings-avatar-preview');
    if (avatarInput && avatarPreview) {
        avatarInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreview.src = e.target.result;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    const showPasswordsCheckbox = document.getElementById('settings-show-passwords');
    if (showPasswordsCheckbox) {
        showPasswordsCheckbox.addEventListener('change', (e) => {
            const type = e.target.checked ? 'text' : 'password';
            document.getElementById('settings-current-password').type = type;
            document.getElementById('settings-password').type = type;
            document.getElementById('settings-confirm-password').type = type;
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('settings-fullname').value;
            const department = document.getElementById('settings-department').value;
            const jobTitle = document.getElementById('settings-jobtitle').value;
            const phone = document.getElementById('settings-phone').value;
            const avatarFile = document.getElementById('settings-avatar')?.files[0];
            
            const currentPassword = document.getElementById('settings-current-password').value;
            const newPassword = document.getElementById('settings-password').value;
            const confirmPassword = document.getElementById('settings-confirm-password').value;

            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;

            try {
                // Upload avatar if changed
                let avatarUrl = user.user_metadata?.avatar_url;
                if (avatarFile) {
                    saveBtn.textContent = 'Uploading image...';
                    const { supabase } = await import('../../api/supabase');
                    const fileExt = avatarFile.name.split('.').pop();
                    const filename = `avatars/${user.id}_${Date.now()}.${fileExt}`;
                    
                    const { data, error } = await supabase.storage
                        .from('course_assets')
                        .upload(filename, avatarFile, { upsert: true });
                        
                    if (error) throw new Error("Failed to upload avatar: " + error.message);
                    
                    const { data: publicData } = supabase.storage
                        .from('course_assets')
                        .getPublicUrl(filename);
                        
                    avatarUrl = publicData.publicUrl;
                }

                // Password Validation
                if (newPassword && newPassword.trim() !== '') {
                    if (!currentPassword) {
                        throw new Error("Current Password is required to set a new password.");
                    }
                    if (newPassword !== confirmPassword) {
                        throw new Error("New Password and Confirm Password do not match.");
                    }
                    
                    const { verifyCurrentPassword, updatePassword } = await import('../../api/auth');
                    // Verify current password first
                    await verifyCurrentPassword(user.email, currentPassword);
                    // Update password
                    await updatePassword(newPassword);
                }

                // Determine what needs to be updated
                const updates = {};
                if (fullName !== (user.full_name || user.user_metadata?.full_name)) updates.fullName = fullName;
                if (department !== (user.department || user.user_metadata?.department)) updates.department = department;
                if (jobTitle !== (user.user_metadata?.job_title || '')) updates.jobTitle = jobTitle;
                if (phone !== (user.user_metadata?.phone || '')) updates.phone = phone;
                if (avatarUrl !== user.user_metadata?.avatar_url) updates.avatarUrl = avatarUrl;

                // Update Profile Details
                if (Object.keys(updates).length > 0) {
                    await updateUserProfile(user.id, updates);
                }

                await fswAlert('Profile updated successfully!');
                closeModal();
                
                // If the user changed their name/department/jobTitle, reloading is best to refresh the UI state
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
