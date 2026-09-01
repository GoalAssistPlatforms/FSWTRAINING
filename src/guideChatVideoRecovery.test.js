// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { matchVideoGuideForMessage } from './guideChatVideoRecovery.js';

describe('guide chat video recovery', () => {
  const courses = [
    {
      id: 'camera-guide',
      title: 'How to make a cup of tea',
      content_json: {
        type: 'video_walkthrough',
        videoUrl: 'https://example.com/tea.mp4'
      }
    },
    {
      id: 'simulation-guide',
      title: 'How to use Sage',
      content_json: {
        is_system_simulation: true,
        slides: []
      }
    }
  ];

  it('matches a camera guide when the assistant names the guide', () => {
    const match = matchVideoGuideForMessage(
      'According to the How to make a cup of tea guide, follow these steps.',
      '',
      courses
    );

    expect(match?.id).toBe('camera-guide');
  });

  it('matches a camera guide from the user question even when the answer omits the exact title', () => {
    const match = matchVideoGuideForMessage(
      'Here are the steps you should follow.',
      'How to make a cup of tea',
      courses
    );

    expect(match?.id).toBe('camera-guide');
  });

  it('does not recover software simulations as video walkthroughs', () => {
    const match = matchVideoGuideForMessage(
      'How to use Sage',
      'How to use Sage',
      courses
    );

    expect(match).toBeNull();
  });
});
