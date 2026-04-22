import { getPlatformSettings, updatePlatformSettings } from '../api/admin';
import { fswAlert } from '../utils/dialog';

export const renderAdminDashboard = (user) => {
    return `
      <div style="padding: 2rem; max-width: 800px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <div>
            <h1 style="margin: 0; color: var(--primary);">Platform Settings</h1>
            <p style="color: var(--text-muted); margin-top: 0.5rem;">Manage global limits for the FSW Platform instance.</p>
          </div>
        </div>
  
        <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg);">
          <form id="admin-settings-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-weight: 600; color: var(--text-muted);">Maximum Total Users</label>
                <input type="number" id="setting-max-users" class="input-base" min="1" required placeholder="e.g. 50" />
                <small style="color: var(--text-muted); font-size: 0.8rem;">Absolute cap on how many active user profiles can exist at one time.</small>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-weight: 600; color: var(--text-muted);">Subscription Start Date</label>
                <input type="date" id="setting-start-date" class="input-base" required />
                <small style="color: var(--text-muted); font-size: 0.8rem;">The initial date the subscription started. This is used to calculate the current billing period.</small>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-weight: 600; color: var(--text-muted);">Renewal Period (Months)</label>
                <input type="number" id="setting-renewal-months" class="input-base" min="1" required placeholder="e.g. 12" />
                <small style="color: var(--text-muted); font-size: 0.8rem;">How often the quotas refresh automatically.</small>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-weight: 600; color: var(--text-muted);">Max Courses Per Period</label>
                <input type="number" id="setting-max-courses" class="input-base" min="1" required placeholder="e.g. 12" />
                <small style="color: var(--text-muted); font-size: 0.8rem;">Limit on how many courses can be produced within the current billing period.</small>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="font-weight: 600; color: var(--text-muted);">Max Interactive Guides Per Period</label>
                <input type="number" id="setting-max-guides" class="input-base" min="1" required placeholder="e.g. 12" />
                <small style="color: var(--text-muted); font-size: 0.8rem;">Limit on how many interactive guides can be produced within the current billing period.</small>
            </div>
  
            <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
              <button type="submit" class="btn-primary" id="save-settings-btn">Save Settings</button>
            </div>
          </form>
        </div>
      </div>
    `
}

export const initAdminEvents = async () => {
    const form = document.getElementById('admin-settings-form');
    if (!form) return;

    const maxUsersInput = document.getElementById('setting-max-users');
    const startDateInput = document.getElementById('setting-start-date');
    const renewalMonthsInput = document.getElementById('setting-renewal-months');
    const maxCoursesInput = document.getElementById('setting-max-courses');
    const maxGuidesInput = document.getElementById('setting-max-guides');
    const saveBtn = document.getElementById('save-settings-btn');

    try {
        const settings = await getPlatformSettings();
        
        maxUsersInput.value = settings.max_users || 10;
        renewalMonthsInput.value = settings.renewal_period_months || 12;
        maxCoursesInput.value = settings.max_courses_per_period || 12;
        maxGuidesInput.value = settings.max_guides_per_period || 12;

        if (settings.subscription_start_date) {
            // Format to YYYY-MM-DD for the date input
            const dateObj = new Date(settings.subscription_start_date);
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            startDateInput.value = `${yyyy}-${mm}-${dd}`;
        }
    } catch (error) {
        console.error('Failed to load settings', error);
        fswAlert('Could not load current platform settings.');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const originalText = saveBtn.innerText;
        saveBtn.innerText = 'Saving...';
        saveBtn.disabled = true;

        try {
            // Reconstruct ISO string from date input
            const dateVal = startDateInput.value; // YYYY-MM-DD
            const isoDate = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();

            await updatePlatformSettings({
                max_users: parseInt(maxUsersInput.value, 10),
                subscription_start_date: isoDate,
                renewal_period_months: parseInt(renewalMonthsInput.value, 10),
                max_courses_per_period: parseInt(maxCoursesInput.value, 10),
                max_guides_per_period: parseInt(maxGuidesInput.value, 10)
            });

            await fswAlert('Platform settings saved successfully!');
        } catch (error) {
            console.error('Failed to save settings', error);
            fswAlert('Failed to save settings: ' + (error.message || 'Unknown error'));
        } finally {
            saveBtn.innerText = originalText;
            saveBtn.disabled = false;
        }
    });
}
