import './styles/style.css'

import { getCurrentUser, signOut } from './api/auth'
import { renderLogin } from './views/Login'
import { renderManagerDashboard, initManagerEvents } from './views/ManagerDashboard'
import { renderUserDashboard, initUserEvents } from './views/UserDashboard'
import { renderAdminDashboard, initAdminEvents } from './views/AdminDashboard'
import { renderNotificationBell, initNotificationEvents } from './views/components/NotificationBell'
import { checkAndGenerateDeadlineNotifications } from './utils/deadlineChecker'

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

  app.innerHTML = `
    <header class="glass" style="padding: 1rem 2rem; border-radius: var(--radius-lg); margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; background: rgba(20, 30, 60, 0.6); position: relative; z-index: 1000;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div class="logo-badge">
          <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 48px; width: auto;">
        </div>
        <div style="display: flex; flex-direction: column;">
          <h2 style="margin: 0; font-size: 1.5rem; line-height: 1;">FSW</h2>
          <span style="font-size: 0.8rem; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase;">Training Platform</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 1rem;">
        ${adminToggleHtml}
        <div id="notification-bell-placeholder">
            ${bellHtml}
        </div>
        <div style="text-align: right;">
           <div style="font-weight: 600;">${user.email}</div>
           <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">${user.role}</div>
        </div>
        <button id="logout-btn" class="btn-secondary">Logout</button>
      </div>
    </header>
    
    <main>
      ${dashboardContent}
    </main>
  `

  document.querySelector('#logout-btn').addEventListener('click', async () => {
    await signOut()
    sessionStorage.removeItem('adminViewMode')
    window.location.reload()
  })

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
