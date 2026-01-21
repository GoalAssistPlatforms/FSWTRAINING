import './styles/style.css'

import { getCurrentUser, signOut } from './api/auth'
import { renderLogin } from './views/Login'
import { renderManagerDashboard, initManagerEvents } from './views/ManagerDashboard'
import { renderUserDashboard, initUserEvents } from './views/UserDashboard'

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
      renderMainLayout(user)
    }
  } catch (error) {
    console.error('Init error:', error)
    renderLogin()
  }
}

export const renderMainLayout = (user) => {
  const app = document.querySelector('#app')

  const dashboardContent = user.role === 'manager'
    ? renderManagerDashboard(user)
    : renderUserDashboard(user)

  app.innerHTML = `
    <header class="glass" style="padding: 1rem 2rem; border-radius: var(--radius-lg); margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; background: rgba(20, 30, 60, 0.6);">
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
    window.location.reload()
  })

  // Initialize event listeners for dashboards
  if (user.role === 'manager') {
    initManagerEvents()
  } else {
    initUserEvents()
  }
}

initApp()
