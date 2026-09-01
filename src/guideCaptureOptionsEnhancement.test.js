// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhanceGuideCaptureOptions } from './guideCaptureOptionsEnhancement.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#guide-capture-options-enhancement-styles')?.remove();
  try { delete navigator.mediaDevices; } catch (error) {}
  vi.restoreAllMocks();
});

const renderBuilder = () => {
  document.body.innerHTML = `
    <div id="root">
      <div id="sys-builder-root">
        <p id="sys-builder-subtitle">Old subtitle</p>
        <div id="sys-walkthrough-setup-wrapper">
          <label>Walkthrough Setup</label>
          <div id="rec-setup-ui">
            <div>Old heading</div>
            <p>Old copy</p>
            <button id="sys-start-rec-btn">Start Walkthrough Recording</button>
            <div>OR</div>
            <div id="upload-wrapper">
              <label for="sys-upload-video-input">Upload screen recording</label>
              <input type="file" id="sys-upload-video-input" accept="video/mp4">
            </div>
          </div>
        </div>
      </div>
    </div>`;
  return document.getElementById('root');
};

describe('guide capture options enhancement', () => {
  it('shows three concise actions while preserving the existing recording and upload controls', () => {
    const root = renderBuilder();
    const startButton = document.getElementById('sys-start-rec-btn');
    const uploadInput = document.getElementById('sys-upload-video-input');
    let startClicks = 0;
    let uploadChanges = 0;
    startButton.addEventListener('click', () => { startClicks += 1; });
    uploadInput.addEventListener('change', () => { uploadChanges += 1; });

    expect(enhanceGuideCaptureOptions(root)).toBe(true);

    const choices = root.querySelectorAll('.guide-capture-choice');
    expect(choices).toHaveLength(3);
    expect(Array.from(choices).map(choice => choice.querySelector('.guide-capture-choice-title')?.textContent)).toEqual([
      'Screen Recording',
      'Camera Recording',
      'Upload Existing Video'
    ]);
    expect(Array.from(choices).map(choice => choice.querySelector('.guide-capture-choice-copy')?.textContent)).toEqual([
      'Record your screen',
      'Record a real world task',
      'Use a video you already have'
    ]);
    expect(root.textContent).not.toContain('All three routes');

    expect(root.querySelector('#sys-start-rec-btn')).toBe(startButton);
    expect(root.querySelector('#sys-upload-video-input')).toBe(uploadInput);

    startButton.click();
    uploadInput.dispatchEvent(new Event('change'));
    expect(startClicks).toBe(1);
    expect(uploadChanges).toBe(1);
  });

  it('routes Camera Recording through the existing recorder using the webcam as the video source', () => {
    const root = renderBuilder();
    const startButton = document.getElementById('sys-start-rec-btn');
    const cameraStream = { getVideoTracks: () => [] };
    const getUserMedia = vi.fn().mockResolvedValue(cameraStream);
    const originalDisplayMedia = vi.fn();

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        getDisplayMedia: originalDisplayMedia
      }
    });

    startButton.addEventListener('click', () => {
      navigator.mediaDevices.getDisplayMedia();
    });

    enhanceGuideCaptureOptions(root);
    root.querySelector('#sys-start-camera-btn').click();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({
      video: {
        facingMode: { ideal: 'environment' }
      },
      audio: false
    });
    expect(originalDisplayMedia).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getDisplayMedia).toBe(originalDisplayMedia);
  });
});
