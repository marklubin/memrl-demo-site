export interface SliderConfig {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

export function createSlider(config: SliderConfig): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'control-group';

  const label = document.createElement('label');
  label.textContent = config.label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.value = String(config.value);

  const display = document.createElement('span');
  display.className = 'mono';
  display.style.fontSize = '11px';
  display.style.minWidth = '36px';
  display.style.textAlign = 'right';
  display.textContent = formatValue(config.value, config.step);

  input.addEventListener('input', () => {
    const val = parseFloat(input.value);
    display.textContent = formatValue(val, config.step);
    config.onChange(val);
  });

  wrapper.append(label, input, display);
  return wrapper;
}

export function updateSliderValue(wrapper: HTMLElement, value: number): void {
  const input = wrapper.querySelector('input[type="range"]') as HTMLInputElement | null;
  const display = wrapper.querySelector('span') as HTMLSpanElement | null;
  if (input) {
    input.value = String(value);
    const step = parseFloat(input.step);
    if (display) display.textContent = formatValue(value, step);
  }
}

function formatValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}
