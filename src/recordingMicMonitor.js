// Watches the microphone while a walkthrough is being recorded. A guide is built entirely from
// what the person says, so a recording with no narration is useless: the transcript comes back
// as Whisper's silence filler and no timeline steps can be generated. Telling someone while they
// are still recording is far better than finding out afterwards.

// Average analyser level (0-255) that counts as someone speaking. Room tone sits below this.
export const MIC_ACTIVITY_THRESHOLD = 4;
// How long to listen before deciding nothing is coming through, so a quiet moment at the start
// does not trigger a false alarm.
export const MIC_SILENCE_GRACE_MS = 6000;

export const MIC_ADVICE = [
  'Check the microphone is not muted, including any mute switch on a headset.',
  'Check the right input device is selected in your system sound settings.',
  'Make sure this browser tab is allowed to use the microphone.',
  'Speak a little louder, or move closer to the microphone.'
];

// The same advice as one block of text, for dialogs that take a plain string.
export const micAdviceText = () => MIC_ADVICE.map(advice => `• ${advice}`).join('\n');

/**
 * Tracks whether the microphone has produced any sound during a recording.
 *
 * @param {object} [options]
 * @param {number} [options.threshold] Average level (0-255) that counts as sound.
 * @param {number} [options.graceMs] How long to wait before reporting silence.
 */
export const createMicActivityMonitor = ({
  threshold = MIC_ACTIVITY_THRESHOLD,
  graceMs = MIC_SILENCE_GRACE_MS
} = {}) => {
  let heardAudio = false;
  let peakLevel = 0;
  let elapsedMs = 0;
  let trackFault = null;

  const status = () => {
    if (trackFault) return 'silent';
    if (heardAudio) return 'ok';
    return elapsedMs < graceMs ? 'listening' : 'silent';
  };

  return {
    /**
     * Feed one reading from the analyser.
     *
     * @param {number} level Average level for this sample, 0-255.
     * @param {number} sinceLastSampleMs Milliseconds since the previous sample.
     * @returns {'listening'|'ok'|'silent'}
     */
    sample(level, sinceLastSampleMs = 0) {
      const value = Number.isFinite(level) ? level : 0;
      elapsedMs += Math.max(0, Number(sinceLastSampleMs) || 0);
      if (value > peakLevel) peakLevel = value;
      if (value >= threshold) heardAudio = true;
      return status();
    },
    /** Report that the track itself stopped or muted, which is silence whatever the meter says. */
    reportTrackFault(reason) {
      trackFault = reason || 'The microphone stopped working.';
      return status();
    },
    /** The track started producing sound again, so the warning no longer applies. */
    clearTrackFault() {
      trackFault = null;
      return status();
    },
    status,
    get heardAudio() {
      return heardAudio;
    },
    get peakLevel() {
      return peakLevel;
    },
    get trackFault() {
      return trackFault;
    }
  };
};

/**
 * Checks a microphone track before recording starts. Returns a plain-English problem, or null
 * when the track looks usable. `muted` is deliberately not treated as a fault here: browsers
 * report it transiently on a healthy track, so the live meter is left to judge that.
 */
export const describeMicTrackProblem = track => {
  if (!track) return 'No microphone was captured for this recording.';
  if (track.readyState === 'ended') return 'The microphone was disconnected.';
  if (track.enabled === false) return 'The microphone is switched off.';
  return null;
};
