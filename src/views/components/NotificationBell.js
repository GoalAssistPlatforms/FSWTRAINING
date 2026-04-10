import { fetchMyNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../api/notifications.js';

export async function renderNotificationBell() {
    try {
        const notifications = await fetchMyNotifications();
        const unreadNotifications = notifications;
        const unreadCount = unreadNotifications.length;

        let itemsHtml = unreadNotifications.map(n => {
            let iconSvg, iconColor;
            if (n.type === 'nudge') {
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
                iconColor = "#f59e0b"; // Orange
            } else if (n.type === 'system_alert') {
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
                iconColor = "#3b82f6"; // Blue
            } else {
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
                iconColor = "#10b981"; // Green
            }

            const title = n.type === 'nudge' ? 'Manager Nudge' : n.type === 'system_alert' ? 'System Alert' : 'Message';
            
            // Format date compactly
            const dateObj = new Date(n.created_at);
            const isToday = new Date().toDateString() === dateObj.toDateString();
            const dateStr = isToday ? dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

            return `
                <div class="notification-item unread clickable-notif" 
                     data-id="${n.id}"
                     data-title="${encodeURIComponent(title)}"
                     data-message="${encodeURIComponent(n.message)}"
                     data-date="${encodeURIComponent(dateStr)}"
                     data-course="${n.course ? encodeURIComponent(n.course.title) : ''}"
                     data-color="${iconColor}"
                     data-svg="${encodeURIComponent(iconSvg)}"
                     style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); position: relative; align-items: flex-start; transition: background 0.2s; border-radius: 6px; margin: 0 -8px; padding: 12px 8px; cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
                    
                    <div style="flex-shrink: 0; width: 38px; height: 38px; border-radius: 50%; background: ${iconColor}15; color: ${iconColor}; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 1px ${iconColor}30;">
                        ${iconSvg}
                    </div>

                    <div style="flex-grow: 1; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                            <span style="font-weight: 600; font-size: 0.9rem; color: #fff;">${title}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 8px; flex-shrink: 0;">${dateStr}</span>
                        </div>
                        
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: normal;">
                            ${n.message}
                        </div>
                        
                        ${n.course ? `
                            <div style="font-size: 0.75rem; color: #3b82f6; margin-top: 6px; font-weight: 500; display: flex; align-items: center; gap: 4px;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                                ${n.course.title}
                            </div>
                        ` : ''}
                    </div>

                    <button class="mark-read-btn" data-id="${n.id}" style="flex-shrink: 0; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; opacity: 0.4; transition: all 0.2s; margin-top: -4px; margin-right: -4px;" onmouseover="this.style.opacity=1; this.style.color='#ef4444';" onmouseout="this.style.opacity=0.4; this.style.color='var(--text-muted)';" title="Dismiss">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            `;
        }).join('');

        if (unreadNotifications.length === 0) {
            itemsHtml = `<div class="notification-empty" style="color: var(--text-muted); text-align: center; padding: 1rem;">No new notifications</div>`;
        }

        return `
            <div class="notification-container" style="position: relative;">
                <button id="notification-bell-btn" class="glass icon-btn" style="position: relative; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 4px 10px rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 50%; cursor: pointer; transition: all 0.2s ease;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    ${unreadCount > 0 ? `<span class="badge" style="position: absolute; top: -5px; right: -5px; background: red; color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.7rem;">${unreadCount}</span>` : ''}
                </button>

                <div id="notification-dropdown" class="dropdown-menu hidden" style="display: none; position: absolute; right: 0; top: 120%; width: 320px; max-height: 400px; overflow-y: auto; padding: 1rem; border-radius: var(--radius-md); z-index: 100; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                    <h4 style="margin-top: 0; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                        <span>Notifications</span>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${unreadCount > 0 ? `<span style="font-size: 0.7rem; font-weight: normal; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px;">${unreadCount} New</span>` : ''}
                            ${unreadCount > 0 ? `<button id="clear-all-notifs-btn" style="background: none; border: none; color: #3b82f6; font-size: 0.75rem; cursor: pointer; padding: 0;">Clear All</button>` : ''}
                        </div>
                    </h4>
                    <div class="notification-list">
                        ${itemsHtml}
                    </div>
                </div>
            </div>

        `;
    } catch (e) {
        console.error('Failed to render notification bell:', e);
        return '';
    }
}

export function initNotificationEvents() {
    // Inject modal into body if it doesn't exist
    if (!document.getElementById('full-notification-modal')) {
        const modalHtml = `
            <div id="full-notification-modal" class="hidden" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
                <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255,255,255,0.15); border-radius: var(--radius-lg); width: 90%; max-width: 500px; padding: 1.5rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5); position: relative;">
                    <button id="close-notification-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.5rem; border-radius: 5px; opacity: 0.7; transition: all 0.2s;" onmouseover="this.style.opacity=1; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.opacity=0.7; this.style.background='transparent'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <div style="display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1rem;">
                        <div id="modal-notif-icon" style="flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"></div>
                        <div>
                            <h3 id="modal-notif-title" style="margin: 0; color: #fff; font-size: 1.1rem;"></h3>
                            <div id="modal-notif-date" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 2px;"></div>
                        </div>
                    </div>
                    <div id="modal-notif-message" style="color: rgba(255,255,255,0.85); font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; margin-bottom: 1rem;"></div>
                    <div id="modal-notif-course" style="color: #3b82f6; font-size: 0.85rem; font-weight: 500; display: none; align-items: center; gap: 6px; background: rgba(59, 130, 246, 0.1); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.2);"></div>
                    <button id="mark-read-modal-btn" class="btn-primary" style="width: 100%; margin-top: 1.5rem;">Dismiss Notification</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const bellBtn = document.getElementById('notification-bell-btn');
    const dropdown = document.getElementById('notification-dropdown');

    if (bellBtn && dropdown) {
        bellBtn.addEventListener('click', () => {
            const isHidden = dropdown.style.display === 'none';
            dropdown.style.display = isHidden ? 'block' : 'none';
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!bellBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    if (dropdown) {
        dropdown.addEventListener('click', async (e) => {
            const markReadBtn = e.target.closest('.mark-read-btn');
            const clearAllBtn = e.target.closest('#clear-all-notifs-btn');
            const clickableNotif = e.target.closest('.clickable-notif');

            if (clearAllBtn) {
                try {
                    e.stopPropagation(); // prevent closing
                    clearAllBtn.innerText = 'Clearing...';
                    await markAllNotificationsAsRead();
                    window.dispatchEvent(new CustomEvent('fsw-reload-notifications'));
                } catch (err) {
                    console.error("error clearing all", err);
                }
                return;
            }

            if (markReadBtn) {
                e.stopPropagation(); // don't open modal
                const id = markReadBtn.getAttribute('data-id');
                try {
                    await markNotificationAsRead(id);
                    window.dispatchEvent(new CustomEvent('fsw-reload-notifications'));
                } catch (err) {
                    console.error("error marking read", err);
                }
                return;
            }

            if (clickableNotif) {
                dropdown.style.display = 'none'; // Close dropdown

                // Open Modal
                const modal = document.getElementById('full-notification-modal');
                if (modal) {
                    const iconColor = clickableNotif.getAttribute('data-color');
                    const iconSvg = decodeURIComponent(clickableNotif.getAttribute('data-svg'));
                    
                    document.getElementById('modal-notif-icon').innerHTML = iconSvg;
                    document.getElementById('modal-notif-icon').style.background = iconColor + '15';
                    document.getElementById('modal-notif-icon').style.color = iconColor;
                    document.getElementById('modal-notif-icon').style.boxShadow = `inset 0 0 0 1px ${iconColor}30`;
                    
                    document.getElementById('modal-notif-title').innerText = decodeURIComponent(clickableNotif.getAttribute('data-title'));
                    document.getElementById('modal-notif-date').innerText = decodeURIComponent(clickableNotif.getAttribute('data-date'));
                    document.getElementById('modal-notif-message').innerText = decodeURIComponent(clickableNotif.getAttribute('data-message'));
                    
                    const courseTitle = decodeURIComponent(clickableNotif.getAttribute('data-course'));
                    const courseEl = document.getElementById('modal-notif-course');
                    if (courseTitle) {
                        courseEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> ${courseTitle}`;
                        courseEl.style.display = 'flex';
                    } else {
                        courseEl.style.display = 'none';
                    }

                    const dismissBtn = document.getElementById('mark-read-modal-btn');
                    dismissBtn.onclick = async () => {
                        const id = clickableNotif.getAttribute('data-id');
                        dismissBtn.innerText = 'Dismissing...';
                        try {
                            await markNotificationAsRead(id);
                            modal.style.display = 'none';
                            dismissBtn.innerText = 'Dismiss Notification';
                            window.dispatchEvent(new CustomEvent('fsw-reload-notifications'));
                        } catch (e) {
                            console.error(e);
                        }
                    };

                    modal.style.display = 'flex';
                }
            }
        });
    }

    // Modal Close
    const modal = document.getElementById('full-notification-modal');
    const closeBtn = document.getElementById('close-notification-modal-btn');
    if (modal && closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
}
