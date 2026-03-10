export interface BarChartData {
  labels: string[];
  values: number[];
  colors?: string[];
  threshold?: number;
  thresholdLabel?: string;
  maxValue?: number;
}

export function createBarChart(container: HTMLElement, data: BarChartData): void {
  container.innerHTML = '';

  const maxVal = data.maxValue ?? Math.max(...data.values, 0.01);

  for (let i = 0; i < data.labels.length; i++) {
    const row = document.createElement('div');
    row.className = 'similarity-bar-row';

    const label = document.createElement('span');
    label.className = 'truncate';
    label.style.width = '120px';
    label.style.flexShrink = '0';
    label.textContent = data.labels[i];
    label.title = data.labels[i];

    const bar = document.createElement('div');
    bar.className = 'similarity-bar';

    const fill = document.createElement('div');
    fill.className = 'fill';
    const pct = Math.max(0, Math.min(100, (data.values[i] / maxVal) * 100));
    fill.style.width = `${pct}%`;

    const aboveThreshold = data.threshold === undefined || data.values[i] >= data.threshold;
    fill.classList.add(aboveThreshold ? 'above' : 'below');

    if (data.colors?.[i]) {
      fill.style.background = data.colors[i];
    }

    bar.appendChild(fill);

    const value = document.createElement('span');
    value.style.minWidth = '40px';
    value.style.textAlign = 'right';
    value.textContent = data.values[i].toFixed(3);

    row.append(label, bar, value);
    container.appendChild(row);
  }

  if (data.threshold !== undefined) {
    const line = document.createElement('div');
    line.className = 'threshold-line';
    line.setAttribute('data-label', data.thresholdLabel ?? `δ=${data.threshold}`);
    container.appendChild(line);
  }
}
