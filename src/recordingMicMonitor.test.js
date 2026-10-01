import { describe, expect, it } from 'vitest';
import {
  MIC_SILENCE_GRACE_MS,
  createMicActivityMonitor,
  describeMicTrackProblem
} from './recordingMicMonitor.js';

const feed = (monitor, level, milliseconds) => {
  let last = monitor.status();
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
    last = monitor.sample(level, 100);
  }
  return last;
};

describe('microphone activity monitor', () => {
  it('holds off while the recording is still getting going', () => {
    const monitor = createMicActivityMonitor();
    expect(feed(monitor, 0, MIC_SILENCE_GRACE_MS - 500)).toBe('listening');
  });

  it('reports silence once the grace period passes with nothing heard', () => {
    const monitor = createMicActivityMonitor();
    expect(feed(monitor, 0, MIC_SILENCE_GRACE_MS + 500)).toBe('silent');
    expect(monitor.heardAudio).toBe(false);
  });

  it('treats room tone below the threshold as silence', () => {
    const monitor = createMicActivityMonitor();
    expect(feed(monitor, 2, MIC_SILENCE_GRACE_MS + 500)).toBe('silent');
  });

  it('clears as soon as someone speaks, and stays cleared through later pauses', () => {
    const monitor = createMicActivityMonitor();
    feed(monitor, 0, 2000);
    expect(monitor.sample(30, 100)).toBe('ok');
    expect(feed(monitor, 0, MIC_SILENCE_GRACE_MS + 5000)).toBe('ok');
    expect(monitor.heardAudio).toBe(true);
    expect(monitor.peakLevel).toBe(30);
  });

  it('reports silence immediately when the track itself fails', () => {
    const monitor = createMicActivityMonitor();
    expect(monitor.reportTrackFault('The microphone was muted.')).toBe('silent');
    expect(monitor.trackFault).toBe('The microphone was muted.');
  });

  it('drops the warning when a muted microphone comes back', () => {
    const monitor = createMicActivityMonitor();
    monitor.reportTrackFault('The microphone was muted during recording.');
    expect(monitor.clearTrackFault()).toBe('listening');
    expect(monitor.sample(30, 100)).toBe('ok');
  });

  it('ignores readings that are not numbers', () => {
    const monitor = createMicActivityMonitor();
    expect(monitor.sample(Number.NaN, 100)).toBe('listening');
    expect(monitor.peakLevel).toBe(0);
  });
});

describe('microphone track checks', () => {
  it('accepts a live track', () => {
    expect(describeMicTrackProblem({ readyState: 'live', enabled: true, muted: false })).toBeNull();
  });

  it('does not fault a track the browser has momentarily marked muted', () => {
    expect(describeMicTrackProblem({ readyState: 'live', enabled: true, muted: true })).toBeNull();
  });

  it('explains a missing, ended or disabled track', () => {
    expect(describeMicTrackProblem(null)).toMatch(/No microphone/);
    expect(describeMicTrackProblem({ readyState: 'ended' })).toMatch(/disconnected/);
    expect(describeMicTrackProblem({ readyState: 'live', enabled: false })).toMatch(/switched off/);
  });
});
