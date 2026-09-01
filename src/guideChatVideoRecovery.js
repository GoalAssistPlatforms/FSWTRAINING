import { supabase } from './api/supabase.js';
import { getCurrentUser } from './api/auth.js';

const normaliseForMatch = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parseCourseContent = course => {
  if (!course) return null;
  const content = course.content_json;
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }
  return content && typeof content === 'object' ? content : null;
};

export const matchVideoGuideForMessage = (assistantText, userText, courses = []) => {
  const combined = `${normaliseForMatch(assistantText)} ${normaliseForMatch(userText)}`.trim();
  if (!combined) return null;

  return courses.find(course => {
    const content = parseCourseContent(course);
    if (content?.type !== 'video_walkthrough') return false;
    const title = normaliseForMatch(course.title);
    return title.length >= 4 && combined.includes(title);
  }) || null;
};

const fetchLiveVideoGuides = async () => {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, description, content_json')
    .eq('status', 'live');

  if (error) throw error;
  return (data || []).filter(course => parseCourseContent(course)?.type === 'video_walkthrough');
};

const findPreviousUserText = message => {
  let sibling = message?.previousElementSibling || null;
  while (sibling) {
    if (sibling.style?.alignSelf === 'flex-end') return sibling.textContent || '';
    sibling = sibling.previousElementSibling;
  }
  return '';
};

const createRecoveredSource = (message, course) => {
  const contentHost = message.querySelector(':scope > div > div') || message;
  const embed = document.createElement('div');
  embed.id = `video-guide-recovery-${Math.random().toString(36).slice(2, 11)}`;
  embed.className = 'interactive-chat-embed recovered-video-guide-embed';
  embed.dataset.course = JSON.stringify(course);

  const sourceRow = document.createElement('div');
  sourceRow.className = 'recovered-video-guide-source';
  sourceRow.style.cssText = 'margin-top:15px;display:flex;gap:0.5rem;flex-wrap:wrap;';

  const sourceButton = document.createElement('button');
  sourceButton.type = 'button';
  sourceButton.className = 'source-link recovered-video-guide-link';
  sourceButton.style.cssText = 'background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:12px;font-size:0.8rem;border:1px solid rgba(255,255,255,0.1);cursor:pointer;color:white;';
  sourceButton.textContent = `▶ ${course.title}`;
  sourceRow.appendChild(sourceButton);

  contentHost.append(embed, sourceRow);
  return { embed, sourceButton };
};

export const initGuideChatVideoRecovery = root => {
  if (!root) return () => {};

  let destroyed = false;
  let queued = false;
  let guidesPromise = null;
  let userPromise = null;

  const getGuides = () => {
    guidesPromise ||= fetchLiveVideoGuides().catch(error => {
      console.warn('Unable to load video guides for chat recovery:', error);
      return [];
    });
    return guidesPromise;
  };

  const getUser = () => {
    userPromise ||= getCurrentUser().catch(() => null);
    return userPromise;
  };

  const recoverMessage = async (message, guides, user) => {
    if (!message?.isConnected || message.dataset.videoGuideRecoveryChecked === 'true') return;
    if (message.style?.alignSelf !== 'flex-start') return;
    if (message.id === 'chat-loading') return;

    if (message.querySelector('.interactive-chat-embed')) {
      message.dataset.videoGuideRecoveryChecked = 'true';
      return;
    }

    const course = matchVideoGuideForMessage(
      message.textContent || '',
      findPreviousUserText(message),
      guides
    );

    message.dataset.videoGuideRecoveryChecked = 'true';
    if (!course) return;

    const { embed, sourceButton } = createRecoveredSource(message, course);

    sourceButton.addEventListener('click', async () => {
      const { renderCoursePlayer } = await import('./views/CoursePlayer.js');
      renderCoursePlayer(course, user);
    });

    try {
      const { renderSimulationPlayer } = await import('./views/components/SimulationPlayer.js');
      renderSimulationPlayer(course, user, embed.id);
    } catch (error) {
      console.warn('Unable to restore video guide in chat:', error);
      embed.remove();
    }
  };

  const sync = async () => {
    if (destroyed) return;
    const chatHistory = root.querySelector?.('#chat-history');
    if (!chatHistory) return;

    const [guides, user] = await Promise.all([getGuides(), getUser()]);
    if (destroyed || !guides.length) return;

    const messages = Array.from(chatHistory.children).filter(child =>
      child.id !== 'chat-greeting' && child.id !== 'chat-loading'
    );
    for (const message of messages) {
      await recoverMessage(message, guides, user);
    }
  };

  const scheduleSync = () => {
    if (queued || destroyed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(root, { childList: true, subtree: true });
  scheduleSync();

  return () => {
    destroyed = true;
    observer.disconnect();
  };
};
