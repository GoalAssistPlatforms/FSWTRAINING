import { describe, expect, it } from 'vitest';
import { organiseChats } from './guidesChatOrganisation.js';

describe('organiseChats', () => {
  const items = [
    { id: 'a', title: 'Pinned chat' },
    { id: 'b', title: 'Project chat' },
    { id: 'c', title: 'Normal chat' }
  ];

  it('keeps pinned chats at the top and out of project groups', () => {
    const state = {
      projects: [{ id: 'project1', name: 'Onboarding' }],
      chats: {
        a: { pinned: true, projectId: 'project1' },
        b: { projectId: 'project1' }
      }
    };

    const result = organiseChats(items, state);
    expect(result.pinned.map(item => item.id)).toEqual(['a']);
    expect(result.byProject.get('project1').map(item => item.id)).toEqual(['b']);
    expect(result.unfiled.map(item => item.id)).toEqual(['c']);
  });

  it('returns chats with missing projects to the unfiled list', () => {
    const result = organiseChats(items, {
      projects: [],
      chats: { b: { projectId: 'deleted-project' } }
    });

    expect(result.unfiled.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });
});
