import './styles/style.css'

import { getCurrentUser, signOut } from './api/auth'
import { renderLogin } from './views/Login'
import { renderManagerDashboard, initManagerEvents } from './views/ManagerDashboard'
import { renderUserDashboard, initUserEvents } from './views/UserDashboard'
import { renderAdminDashboard, initAdminEvents } from './views/AdminDashboard'
import { renderNotificationBell, initNotificationEvents } from './views/components/NotificationBell'
import { renderSettingsModal, initSettingsEvents } from './views/components/SettingsModal'
import { checkAndGenerateDeadlineNotifications } from './utils/deadlineChecker'
import { renderFeedbackModal, initFeedbackEvents } from './views/components/FeedbackModal'

const initApp = async () => {
  const app = document.querySelector('#app')

  // Show loading state
  app.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
      <div class="glass" style="padding: 2rem; border-radius: var(--radius-md);">
        <p style="color: var(--text-muted);">Loading FSW Platform...</p>
      </div>
    </div>
  `

  try {
    const user = await getCurrentUser()

    if (window.location.pathname === '/test-builder') {
      const { renderBespokeBuilderDemo } = await import('./views/BespokeBuilderDemo')
      renderBespokeBuilderDemo()
      return
    }

    if (window.location.pathname === '/test-player') {
      const { renderBespokePlayerDemo } = await import('./views/BespokePlayerDemo')
      renderBespokePlayerDemo()
      return
    }

    if (window.location.pathname === '/reset-password') {
      // We need to handle the case where the user lands here via email link
      // Supabase handles the session exchange, so we just show the reset form
      // But we should verify we have a user effectively (triggered by the link)
      // If not, it might just redirect to login, but let's try rendering the form
      const { renderResetPassword } = await import('./views/Login')
      renderResetPassword()
      return
    }

    if (!user) {
      renderLogin()
    } else if (user.role === 'archived') {
      await signOut()
      if (typeof fswAlert === 'function') {
          await fswAlert('Your account has been archived by your administrator and can no longer be accessed.')
      } else {
          alert('Your account has been archived by your administrator and can no longer be accessed.')
      }
      renderLogin()
    } else {
      await renderMainLayout(user)
    }
  } catch (error) {
    console.error('Init error:', error)
    renderLogin()
  }
}

export const renderMainLayout = async (user) => {
  const app = document.querySelector('#app')

  // Run the deadline checker on startup for the user
  await checkAndGenerateDeadlineNotifications();

  const bellHtml = await renderNotificationBell();

  // Determine effective role based on admin toggle
  let effectiveRole = user.role;
  let adminToggleHtml = '';

  if (user.role === 'admin') {
      const savedView = sessionStorage.getItem('adminViewMode') || 'admin';
      effectiveRole = savedView;

      adminToggleHtml = `
        <div style="background: rgba(255,255,255,0.1); padding: 0.25rem 0.75rem; border-radius: var(--radius-md); display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; margin-right: 1rem;">
            <span style="color: var(--text-muted); text-transform: uppercase;">View As:</span>
            <select id="admin-view-toggle" style="background: transparent; color: white; border: none; outline: none; cursor: pointer; font-weight: bold;">
                <option value="admin" ${savedView === 'admin' ? 'selected' : ''} style="color: black;">Admin</option>
                <option value="manager" ${savedView === 'manager' ? 'selected' : ''} style="color: black;">Manager</option>
                <option value="user" ${savedView === 'user' ? 'selected' : ''} style="color: black;">User</option>
            </select>
        </div>
      `;
  }

  let dashboardContent = '';
  if (effectiveRole === 'admin') {
      dashboardContent = renderAdminDashboard(user);
  } else if (effectiveRole === 'manager') {
      dashboardContent = renderManagerDashboard(user);
  } else {
      dashboardContent = renderUserDashboard(user);
  }

  const initials = user.full_name 
      ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
      : user.email.substring(0, 2).toUpperCase();

  const avatarHtml = user.avatar_url 
      ? `<img src="${user.avatar_url}" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.2);">`
      : `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--accent) 0%, #3b82f6 100%); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; border: 2px solid rgba(255,255,255,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${initials}</div>`;

  app.innerHTML = `
    <header class="glass" style="padding: 1rem 2rem; border-radius: var(--radius-lg); margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; background: rgba(20, 30, 60, 0.6); position: relative; z-index: 1000;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div class="logo-badge">
          <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 48px; width: auto;">
        </div>
        <div style="display: flex; flex-direction: column;">
          <h2 style="margin: 0; font-size: 1.5rem; line-height: 1;">FSW</h2>
          <span style="font-size: 0.8rem; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase;">Aspire Training</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 1rem;">
        ${adminToggleHtml}
        <div id="notification-bell-placeholder">
            ${bellHtml}
        </div>
        
        <button id="settings-btn" style="background: none; border: none; padding: 0; margin-left: 0.5rem; cursor: pointer; outline: none; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: transform 0.2s ease, box-shadow 0.2s ease;" title="Settings" onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 14px rgba(0,0,0,0.3)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 10px rgba(0,0,0,0.2)';">
            ${avatarHtml}
        </button>

        <button id="logout-btn" class="btn-secondary" style="margin-left: 0.5rem;">Logout</button>
      </div>
    </header>
    
    <main>
      ${dashboardContent}
    </main>
    ${renderSettingsModal(user)}
    ${renderFeedbackModal()}
    
    <!-- Floating Feedback Button -->
    <button id="floating-feedback-btn" style="position: fixed; bottom: 20px; right: 20px; z-index: 999; display: flex; align-items: center; gap: 0.5rem; background: rgba(18, 142, 205, 0.9); backdrop-filter: blur(10px); color: white; padding: 0.75rem 1.25rem; border-radius: 50px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-weight: bold; cursor: pointer; transition: all 0.3s; font-size: 0.9rem;" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 15px 35px rgba(18,142,205,0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.3)';">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Feedback
    </button>
  `

  document.querySelector('#logout-btn').addEventListener('click', async () => {
    await signOut()
    sessionStorage.removeItem('adminViewMode')
    window.location.reload()
  })

  const settingsBtn = document.querySelector('#settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      document.getElementById('settings-modal').style.display = 'flex'
    })
  }

  // Floating Feedback button trigger
  const feedbackBtn = document.getElementById('floating-feedback-btn');
  if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
          document.getElementById('feedback-modal').style.display = 'flex';
      });
  }

  // Setup Admin Toggle Listener
  if (user.role === 'admin') {
      const toggle = document.getElementById('admin-view-toggle');
      if (toggle) {
          toggle.addEventListener('change', (e) => {
              sessionStorage.setItem('adminViewMode', e.target.value);
              renderMainLayout(user); // Re-render the layout
          });
      }
  }

  // Initialize event listeners for dashboards
  const effectiveUser = { ...user, role: effectiveRole };
  
  if (effectiveRole === 'admin') {
      initAdminEvents();
  } else if (effectiveRole === 'manager') {
      initManagerEvents(effectiveUser);
  } else {
      initUserEvents(effectiveUser);
  }
  
  initNotificationEvents();
  initSettingsEvents(user);
  initFeedbackEvents();

  // Listen for refresh requests
  window.addEventListener('fsw-reload-notifications', async () => {
      const ph = document.getElementById('notification-bell-placeholder');
      if (ph) {
          ph.innerHTML = await renderNotificationBell();
          initNotificationEvents();
      }
  });
}

initApp()
