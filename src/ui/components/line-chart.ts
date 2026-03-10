export interface LineChartSeries {
  label: string;
  data: number[];
  color: string;
}

/**
 * Simple canvas-based line chart for Q-value convergence.
 */
export function renderLineChart(
  canvas: HTMLCanvasElement,
  series: LineChartSeries[],
  options: { yMin?: number; yMax?: number; xLabel?: string; yLabel?: string } = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 10, right: 10, bottom: 24, left: 36 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Clear
  ctx.clearRect(0, 0, w, h);

  if (series.length === 0 || series.every(s => s.data.length === 0)) {
    ctx.fillStyle = '#5c6070';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', w / 2, h / 2);
    return;
  }

  // Compute bounds
  const allData = series.flatMap(s => s.data);
  const maxLen = Math.max(...series.map(s => s.data.length));
  let yMin = options.yMin ?? Math.min(...allData, 0);
  let yMax = options.yMax ?? Math.max(...allData, 0);
  if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }

  // Grid lines
  ctx.strokeStyle = '#333849';
  ctx.lineWidth = 0.5;
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const y = pad.top + (i / ySteps) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();

    const val = yMax - (i / ySteps) * (yMax - yMin);
    ctx.fillStyle = '#5c6070';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), pad.left - 4, y + 3);
  }

  // Zero line
  if (yMin < 0 && yMax > 0) {
    const zeroY = pad.top + ((yMax - 0) / (yMax - yMin)) * plotH;
    ctx.strokeStyle = '#5c6070';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + plotW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw series
  for (const s of series) {
    if (s.data.length === 0) continue;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < s.data.length; i++) {
      const x = pad.left + (maxLen > 1 ? (i / (maxLen - 1)) * plotW : plotW / 2);
      const y = pad.top + ((yMax - s.data[i]) / (yMax - yMin)) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dot on latest point
    const lastI = s.data.length - 1;
    const lx = pad.left + (maxLen > 1 ? (lastI / (maxLen - 1)) * plotW : plotW / 2);
    const ly = pad.top + ((yMax - s.data[lastI]) / (yMax - yMin)) * plotH;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // X axis label
  if (options.xLabel) {
    ctx.fillStyle = '#5c6070';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(options.xLabel, pad.left + plotW / 2, h - 2);
  }
}
