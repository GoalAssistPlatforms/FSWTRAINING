// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import './activityPickerFlow.js';

function renderPicker() {
    document.body.innerHTML = `
        <div class="activity-type-picker">
            <button class="activity-type-toggle" type="button">Activity: Chat Message</button>
            <div class="activity-type-menu">
                <button type="button" class="activity-type-option" data-activity-type="none"><span>No Activity</span></button>
                <button type="button" class="activity-type-option current" data-activity-type="ai-tone"><span>Chat Message</span></button>
                <button type="button" class="activity-type-option" data-activity-type="ai-dojo"><span>Phone Call</span></button>
            </div>
        </div>
    `;

    return document.querySelector('.activity-type-picker');
}

describe('activity picker flow', () => {
    it('chooses the activity before asking for optional context and only generates after confirmation', async () => {
        const picker = renderPicker();
        const handledSelections = [];
        const menu = picker.querySelector('.activity-type-menu');

        menu.addEventListener('click', event => {
            const option = event.target.closest('[data-activity-type]');
            if (!option) return;
            handledSelections.push({
                type: option.dataset.activityType,
                context: picker.querySelector('.activity-generation-context-input')?.value || ''
            });
        });

        await vi.waitFor(() => expect(picker.querySelector('.activity-generation-context-input')).not.toBeNull());
        expect(picker.querySelector('.activity-generation-context-field')).not.toBeVisible();

        picker.querySelector('[data-activity-type="ai-dojo"]').click();

        expect(handledSelections).toHaveLength(0);
        expect(picker.classList.contains('activity-picker-flow-step')).toBe(true);
        expect(picker.querySelector('.activity-generation-context-field')).toBeVisible();
        expect(picker.querySelector('.activity-picker-flow-title').textContent).toBe('Phone Call');

        const contextInput = picker.querySelector('.activity-generation-context-input');
        contextInput.value = 'Focus on repeated short term absence';
        picker.querySelector('.activity-picker-flow-generate').click();

        expect(handledSelections).toEqual([{
            type: 'ai-dojo',
            context: 'Focus on repeated short term absence'
        }]);
        expect(picker.classList.contains('activity-picker-flow-step')).toBe(false);
        expect(contextInput.value).toBe('');
    });

    it('keeps No Activity as an immediate removal action', async () => {
        const picker = renderPicker();
        const handledSelections = [];
        const menu = picker.querySelector('.activity-type-menu');

        menu.addEventListener('click', event => {
            const option = event.target.closest('[data-activity-type]');
            if (option) handledSelections.push(option.dataset.activityType);
        });

        await vi.waitFor(() => expect(picker.querySelector('.activity-generation-context-input')).not.toBeNull());
        picker.querySelector('[data-activity-type="none"]').click();

        expect(handledSelections).toEqual(['none']);
        expect(picker.classList.contains('activity-picker-flow-step')).toBe(false);
    });
});
