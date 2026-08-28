import { describe, expect, it } from 'vitest';
import { chatMenuLabels } from './guidesChatMenus.js';

describe('chatMenuLabels', () => {
  it('shows one clear menu action for each chat operation', () => {
    expect(chatMenuLabels(false)).toEqual([
      'Pin chat',
      'Move to project',
      'Rename chat',
      'Delete chat'
    ]);
  });

  it('changes the pin action when a chat is already pinned', () => {
    expect(chatMenuLabels(true)[0]).toBe('Unpin chat');
  });
});
