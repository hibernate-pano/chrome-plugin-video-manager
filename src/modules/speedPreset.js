/**
 * Preset speed management
 */

export const PRESET_SPEEDS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.0, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 1.75, label: '1.75x' },
  { value: 2.0, label: '2x' },
  { value: 2.5, label: '2.5x' },
  { value: 3.0, label: '3x' },
];

export const DEFAULT_STEP = 0.1;

export class SpeedPresetManager {
  constructor(customPresets = [], customStep = DEFAULT_STEP) {
    this.presets = customPresets.length > 0 ? customPresets : PRESET_SPEEDS;
    this.step = customStep;
  }

  getPresets() {
    return this.presets;
  }

  getStep() {
    return this.step;
  }

  getClosestPreset(speed) {
    return this.presets.reduce((prev, curr) => {
      return Math.abs(curr.value - speed) < Math.abs(prev.value - speed) ? curr : prev;
    });
  }

  getNextPreset(currentSpeed, direction = 'up') {
    const sorted = [...this.presets].sort((a, b) => a.value - b.value);
    const currentIndex = sorted.findIndex(p => p.value >= currentSpeed);
    
    if (direction === 'up') {
      return sorted[Math.min(currentIndex + 1, sorted.length - 1)];
    } else {
      return sorted[Math.max(currentIndex - 1, 0)];
    }
  }
}
