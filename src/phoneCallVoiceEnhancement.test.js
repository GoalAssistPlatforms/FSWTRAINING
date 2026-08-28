import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractInitialCallerMessage,
  speechRecognitionErrorMessage
} from './phoneCallVoiceEnhancement.js';

describe('phone call voice enhancement', () => {
  it('extracts the opening caller message from the hidden chat transcript', () => {
    const dom = new JSDOM(`
      <div id="root">
        <div id="chat-messages">
          <div>
            <div>C</div>
            <div>Hello, I need some help with this situation.</div>
          </div>
        </div>
      </div>
    `);

    const root = dom.window.document.querySelector('#root');
    expect(extractInitialCallerMessage(root)).toBe('Hello, I need some help with this situation.');
  });

  it('returns an empty string when there is no caller message yet', () => {
    const dom = new JSDOM('<div id="root"></div>');
    const root = dom.window.document.querySelector('#root');
    expect(extractInitialCallerMessage(root)).toBe('');
  });

  it('gives a useful message when microphone permission is denied', () => {
    expect(speechRecognitionErrorMessage('not-allowed')).toContain('Allow microphone access');
  });

  it('gives a useful message when no speech is detected', () => {
    expect(speechRecognitionErrorMessage('no-speech')).toContain('did not hear anything');
  });
});
