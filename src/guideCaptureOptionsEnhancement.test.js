// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhanceGuideCaptureOptions } from './guideCaptureOptionsEnhancement.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#guide-capture-options-enhancement-styles')?.remove();
});

describe('guide capture options enhancement', () => {
  it('shows three capture routes while preserving the existing recording and upload controls', () => {
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

    const root = document.getElementById('root');
    const startButton = document.getElementById('sys-start-rec-btn');
    const uploadInput = document.getElementById('sys-upload-video-input');
    let startClicks = 0;
    let uploadChanges = 0;
    startButton.addEventListener('click', () => { startClicks += 1; });
    uploadInput.addEventListener('change', () => { uploadChanges += 1; });

    expect(enhanceGuideCaptureOptions(root)).toBe(true);

    const cards = root.querySelectorAll('.guide-capture-choice');
    expect(cards).toHaveLength(3);
    expect(Array.from(cards).map(card => card.querySelector('h4')?.textContent)).toEqual([
      'Screen Recording',
      'Camera Recording',
      'Upload Existing Video'
    ]);

    expect(root.querySelector('#sys-start-rec-btn')).toBe(startButton);
    expect(root.querySelector('#sys-upload-video-input')).toBe(uploadInput);

    startButton.click();
    uploadInput.dispatchEvent(new Event('change'));
    expect(startClicks).toBe(1);
    expect(uploadChanges).toBe(1);
  });

  it('uses the existing upload input as the camera capture handoff', () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="sys-builder-root">
          <div id="sys-walkthrough-setup-wrapper">
            <label>Walkthrough Setup</label>
            <div id="rec-setup-ui">
              <button id="sys-start-rec-btn">Start</button>
              <div>
                <label for="sys-upload-video-input">Upload</label>
                <input type="file" id="sys-upload-video-input" accept="video/mp4">
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const root = document.getElementById('root');
    const uploadInput = document.getElementById('sys-upload-video-input');
    const clickSpy = vi.spyOn(uploadInput, 'click').mockImplementation(() => {});

    enhanceGuideCaptureOptions(root);
    root.querySelector('#sys-start-camera-btn').click();

    expect(uploadInput.getAttribute('capture')).toBe('environment');
    expect(uploadInput.getAttribute('accept')).toBe('video/mp4');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
