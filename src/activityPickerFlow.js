const STYLE_ID = 'fsw-activity-picker-flow-styles';
const FLOW_CLASS = 'activity-picker-flow-step';
const CONTEXT_FIELD_CLASS = 'activity-generation-context-field';
const CONTEXT_INPUT_CLASS = 'activity-generation-context-input';
const BACK_CLASS = 'activity-picker-flow-back';
const GENERATE_CLASS = 'activity-picker-flow-generate';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .activity-type-picker .${CONTEXT_FIELD_CLASS} {
            display: none !important;
        }

        .activity-type-picker.${FLOW_CLASS} .activity-type-option {
            display: none !important;
        }

        .activity-type-picker.${FLOW_CLASS} .${CONTEXT_FIELD_CLASS} {
            display: block !important;
            padding: 0.7rem 0.75rem 0.8rem !important;
            margin: 0 !important;
            border-bottom: 0 !important;
        }

        .activity-picker-flow-heading {
            padding: 0.75rem 0.75rem 0.35rem;
        }

        .activity-picker-flow-heading-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-bottom: 0.3rem;
        }

        .activity-picker-flow-title {
            color: white;
            font-size: 0.86rem;
            font-weight: 700;
        }

        .activity-picker-flow-copy {
            color: var(--text-muted);
            font-size: 0.68rem;
            line-height: 1.4;
        }

        .${BACK_CLASS} {
            padding: 0;
            border: 0;
            background: transparent;
            color: #7dd3fc;
            font: inherit;
            font-size: 0.7rem;
            cursor: pointer;
        }

        .activity-picker-flow-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.5rem;
            padding: 0.35rem 0.75rem 0.75rem;
        }

        .${GENERATE_CLASS} {
            width: 100%;
            padding: 0.65rem 0.8rem;
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 7px;
            background: rgba(18, 142, 205, 0.22);
            color: white;
            font: inherit;
            font-size: 0.76rem;
            font-weight: 700;
            cursor: pointer;
        }

        .${GENERATE_CLASS}:hover,
        .${GENERATE_CLASS}:focus-visible {
            background: rgba(18, 142, 205, 0.34);
            outline: none;
        }
    `;
    document.head.appendChild(style);
}

function ensureContextField(picker) {
    const menu = picker?.querySelector?.('.activity-type-menu');
    if (!menu) return null;

    let field = menu.querySelector(`.${CONTEXT_FIELD_CLASS}`);
    if (!field) {
        field = document.createElement('div');
        field.className = CONTEXT_FIELD_CLASS;
        field.innerHTML = `
            <label style="display:block;color:rgba(255,255,255,0.88);font-size:0.72rem;font-weight:700;margin-bottom:0.4rem;">Optional topic or context</label>
            <textarea class="${CONTEXT_INPUT_CLASS}" rows="3" maxlength="1200" placeholder="e.g. Focus this activity on handling repeated short term absence" style="width:100%;box-sizing:border-box;resize:vertical;min-height:68px;padding:0.55rem 0.6rem;border-radius:6px;border:1px solid rgba(255,255,255,0.16);background:rgba(0,0,0,0.35);color:white;font:inherit;font-size:0.75rem;line-height:1.35;outline:none;"></textarea>
            <div style="margin-top:0.35rem;color:var(--text-muted);font-size:0.65rem;line-height:1.3;">Leave blank to generate from the lesson as normal.</div>
        `;
        menu.insertBefore(field, menu.firstChild);
    }

    return field;
}

function clearContext(picker) {
    const input = picker?.querySelector?.(`.${CONTEXT_INPUT_CLASS}`);
    if (input) input.value = '';
}

function resetPickerStep(picker, { clear = true } = {}) {
    if (!picker) return;

    picker.classList.remove(FLOW_CLASS);
    delete picker.dataset.pendingActivityType;
    picker.querySelector('.activity-picker-flow-heading')?.remove();
    picker.querySelector('.activity-picker-flow-actions')?.remove();
    if (clear) clearContext(picker);
}

function showPickerStep(picker, option) {
    const menu = picker?.querySelector?.('.activity-type-menu');
    if (!menu || !option) return;

    const selectedType = option.dataset.activityType;
    if (!selectedType || selectedType === 'none') return;

    resetPickerStep(picker);
    const field = ensureContextField(picker);
    if (!field) return;

    const label = option.querySelector('span')?.textContent?.trim() || 'Activity';
    const isRegeneration = option.classList.contains('current');
    picker.dataset.pendingActivityType = selectedType;
    picker.classList.add(FLOW_CLASS);

    const heading = document.createElement('div');
    heading.className = 'activity-picker-flow-heading';
    heading.innerHTML = `
        <div class="activity-picker-flow-heading-top">
            <div class="activity-picker-flow-title">${isRegeneration ? `Regenerate ${label}` : label}</div>
            <button type="button" class="${BACK_CLASS}">Back</button>
        </div>
        <div class="activity-picker-flow-copy">Add a topic only if you want to steer what this activity covers. The lesson remains the source of truth.</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'activity-picker-flow-actions';
    actions.innerHTML = `<button type="button" class="${GENERATE_CLASS}">${isRegeneration ? `Regenerate ${label}` : `Generate ${label}`}</button>`;

    menu.insertBefore(heading, field);
    menu.appendChild(actions);
    menu.hidden = false;

    setTimeout(() => field.querySelector(`.${CONTEXT_INPUT_CLASS}`)?.focus(), 0);
}

function confirmPickerStep(picker) {
    const selectedType = picker?.dataset?.pendingActivityType;
    if (!selectedType) return;

    const menu = picker.querySelector('.activity-type-menu');
    const option = Array.from(menu?.querySelectorAll?.('.activity-type-option') || [])
        .find(button => button.dataset.activityType === selectedType);
    if (!option) {
        resetPickerStep(picker);
        return;
    }

    const input = picker.querySelector(`.${CONTEXT_INPUT_CLASS}`);
    picker.dataset.activityFlowBypass = selectedType;
    resetPickerStep(picker, { clear: false });
    option.click();
    if (input) input.value = '';
}

function syncPickers() {
    ensureStyles();
    document.querySelectorAll('.activity-type-picker').forEach(ensureContextField);
}

function handleDocumentClick(event) {
    const backButton = event.target.closest?.(`.${BACK_CLASS}`);
    if (backButton) {
        const picker = backButton.closest('.activity-type-picker');
        event.preventDefault();
        event.stopImmediatePropagation();
        resetPickerStep(picker);
        const menu = picker?.querySelector?.('.activity-type-menu');
        if (menu) menu.hidden = false;
        return;
    }

    const generateButton = event.target.closest?.(`.${GENERATE_CLASS}`);
    if (generateButton) {
        const picker = generateButton.closest('.activity-type-picker');
        event.preventDefault();
        event.stopImmediatePropagation();
        confirmPickerStep(picker);
        return;
    }

    const toggle = event.target.closest?.('.activity-type-toggle');
    if (toggle) {
        const picker = toggle.closest('.activity-type-picker');
        if (picker?.classList.contains(FLOW_CLASS)) resetPickerStep(picker);
        return;
    }

    const option = event.target.closest?.('.activity-type-option[data-activity-type]');
    if (!option) return;

    const picker = option.closest('.activity-type-picker');
    if (!picker) return;

    const selectedType = option.dataset.activityType;
    if (picker.dataset.activityFlowBypass === selectedType) {
        delete picker.dataset.activityFlowBypass;
        return;
    }

    if (selectedType === 'none') {
        resetPickerStep(picker);
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    showPickerStep(picker, option);
}

function handleDocumentKeydown(event) {
    if (event.key !== 'Escape') return;
    const picker = event.target.closest?.('.activity-type-picker');
    if (picker?.classList.contains(FLOW_CLASS)) resetPickerStep(picker);
}

export function initActivityPickerFlow() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
    if (window.__fswActivityPickerFlowInitialised) return () => {};

    window.__fswActivityPickerFlowInitialised = true;
    syncPickers();

    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('keydown', handleDocumentKeydown, true);

    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
            queued = false;
            syncPickers();
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
        observer.disconnect();
        document.removeEventListener('click', handleDocumentClick, true);
        document.removeEventListener('keydown', handleDocumentKeydown, true);
        window.__fswActivityPickerFlowInitialised = false;
    };
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    initActivityPickerFlow();
}
