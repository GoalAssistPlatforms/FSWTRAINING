import { signIn, signUp, resetPassword } from '../api/auth'

export const renderLogin = () => {
  const app = document.querySelector('#app')
  let isSignUp = false
  let isForgotPassword = false

  const renderForm = () => {
    let title = 'FSW Training Portal'
    let subtitle = 'Sign in to access your modules'
    let btnText = 'Sign In'

    if (isForgotPassword) {
      title = 'Reset Password'
      subtitle = 'Enter your email to receive a reset link'
      btnText = 'Send Reset Link'
    } else if (isSignUp) {
      title = 'Create Account'
      subtitle = 'Join the FSW Training Platform'
      btnText = 'Sign Up'
    }

    app.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; min-height: 80vh;">
        <div class="glass" style="padding: 3rem; width: 100%; max-width: 400px; border-radius: var(--radius-lg); position: relative; overflow: hidden;">
          <!-- Logo -->
          <div style="display: flex; justify-content: center; margin-bottom: 2rem;">
            <div class="logo-badge">
              <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 60px; object-fit: contain;">
            </div>
          </div>

          <h2 style="margin-bottom: 0.5rem; text-align: center; color: var(--text-main);">${title}</h2>
          <p style="color: var(--text-muted); text-align: center; margin-bottom: 2rem;">
            ${subtitle}
          </p>
          
          <form id="login-form" style="display: flex; flex-direction: column; gap: 1rem;">
            <div>
              <label for="email" style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Email Address</label>
              <input type="email" id="email" required placeholder="Enter your email" 
                style="width: 100%; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; box-sizing: border-box;">
            </div>
            
            ${!isForgotPassword ? `
            <div>
              <label for="password" style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Password</label>
              <input type="password" id="password" required placeholder="Enter your password" 
                style="width: 100%; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; box-sizing: border-box;">
            </div>
            ` : ''}

            <p id="error-msg" style="color: var(--accent); font-size: 0.9rem; text-align: center; display: none;"></p>
            <p id="success-msg" style="color: #10b981; font-size: 0.9rem; text-align: center; display: none;"></p>

            <button type="submit" class="btn-primary" style="margin-top: 1rem;">${btnText}</button>
            
            <div style="text-align: center; font-size: 0.9rem; color: var(--text-muted); margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
              ${!isForgotPassword ? `
                <a href="#" id="toggle-forgot" class="btn-text">Forgot Password?</a>
                <span>
                  ${isSignUp ? 'Already have an account?' : 'Need an account?'} 
                  <a href="#" id="toggle-mode" class="link-primary">
                    ${isSignUp ? 'Sign In' : 'Sign Up'}
                  </a>
                </span>
              ` : `
                <a href="#" id="back-to-login" class="link-primary">Back to Sign In</a>
              `}
            </div>
          </form>
        </div>
      </div>
    `
    attachEvents()
  }

  const attachEvents = () => {
    const toggleModeBtn = document.querySelector('#toggle-mode')
    if (toggleModeBtn) {
      toggleModeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        isSignUp = !isSignUp
        renderForm()
      })
    }

    const toggleForgotBtn = document.querySelector('#toggle-forgot')
    if (toggleForgotBtn) {
      toggleForgotBtn.addEventListener('click', (e) => {
        e.preventDefault()
        isForgotPassword = true
        renderForm()
      })
    }

    const backToLoginBtn = document.querySelector('#back-to-login')
    if (backToLoginBtn) {
      backToLoginBtn.addEventListener('click', (e) => {
        e.preventDefault()
        isForgotPassword = false
        isSignUp = false
        renderForm()
      })
    }

    document.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = document.querySelector('#email').value
      const passwordInput = document.querySelector('#password')
      const password = passwordInput ? passwordInput.value : null
      const errorMsg = document.querySelector('#error-msg')
      const successMsg = document.querySelector('#success-msg')
      const btn = e.target.querySelector('button')

      try {
        btn.disabled = true
        errorMsg.style.display = 'none'
        successMsg.style.display = 'none'

        if (isForgotPassword) {
          btn.innerText = 'Sending...'
          await resetPassword(email)
          successMsg.textContent = 'Reset link sent! Check your email.'
          successMsg.style.display = 'block'
          btn.innerText = 'Send Reset Link'
          btn.disabled = false
        } else if (isSignUp) {
          btn.innerText = 'Creating Account...'
          await signUp(email, password)
          successMsg.textContent = 'Account created! Please check your email to confirm.'
          successMsg.style.display = 'block'
          btn.innerText = 'Sign Up'
          btn.disabled = false
          // Optionally switch back to sign in
          setTimeout(() => {
            isSignUp = false
            renderForm() // Reset to login view
            document.querySelector('#success-msg').textContent = 'Account created! Please sign in.'
            document.querySelector('#success-msg').style.display = 'block'
          }, 2000)
        } else {
          btn.innerText = 'Signing in...'
          await signIn(email, password)
          window.location.reload()
        }
      } catch (err) {
        console.error(err)
        errorMsg.textContent = err.message || 'Authentication failed'
        errorMsg.style.display = 'block'

        // Reset button text
        if (isForgotPassword) btn.innerText = 'Send Reset Link'
        else if (isSignUp) btn.innerText = 'Sign Up'
        else btn.innerText = 'Sign In'

        btn.disabled = false
      }
    })
  }

  renderForm()
}

export const renderResetPassword = () => {
  const app = document.querySelector('#app')

  app.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; min-height: 80vh;">
        <div class="glass" style="padding: 3rem; width: 100%; max-width: 400px; border-radius: var(--radius-lg); position: relative; overflow: hidden;">
          <h2 style="margin-bottom: 0.5rem; text-align: center; color: var(--text-main);">Set New Password</h2>
          <p style="color: var(--text-muted); text-align: center; margin-bottom: 2rem;">
            Please enter your new password below.
          </p>
          
          <form id="reset-password-form" style="display: flex; flex-direction: column; gap: 1rem;">
            <div>
              <label for="new-password" style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">New Password</label>
              <input type="password" id="new-password" required placeholder="Enter new password" 
                style="width: 100%; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; box-sizing: border-box;">
            </div>
            
            <p id="error-msg" style="color: var(--accent); font-size: 0.9rem; text-align: center; display: none;"></p>
            <p id="success-msg" style="color: #10b981; font-size: 0.9rem; text-align: center; display: none;"></p>

            <button type="submit" class="btn-primary" style="margin-top: 1rem;">Update Password</button>
          </form>
        </div>
      </div>
    `

  document.querySelector('#reset-password-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const newPassword = document.querySelector('#new-password').value
    const btn = e.target.querySelector('button')
    const errorMsg = document.querySelector('#error-msg')
    const successMsg = document.querySelector('#success-msg')

    try {
      btn.innerText = 'Updating...'
      btn.disabled = true
      errorMsg.style.display = 'none'

      // Dynamic import to avoid circular dependency issues if any
      const { updatePassword } = await import('../api/auth')
      await updatePassword(newPassword)

      successMsg.textContent = 'Password updated successfully! Redirecting...'
      successMsg.style.display = 'block'

      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    } catch (err) {
      console.error(err)
      errorMsg.textContent = err.message || 'Failed to update password'
      errorMsg.style.display = 'block'
      btn.innerText = 'Update Password'
      btn.disabled = false
    }
  })
}
