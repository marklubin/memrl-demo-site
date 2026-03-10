export interface TableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => string | HTMLElement;
  sortable?: boolean;
  width?: string;
}

export interface TableConfig<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowClass?: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function createTable<T>(config: TableConfig<T>): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'scoring-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of config.columns) {
    const th = document.createElement('th');
    th.textContent = col.label;
    if (col.width) th.style.width = col.width;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (const row of config.data) {
    const tr = document.createElement('tr');
    if (config.rowClass) tr.className = config.rowClass(row);
    if (config.onRowClick) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => config.onRowClick!(row));
    }

    for (const col of config.columns) {
      const td = document.createElement('td');
      const content = col.render(row);
      if (typeof content === 'string') {
        td.textContent = content;
      } else {
        td.appendChild(content);
      }
      td.title = typeof content === 'string' ? content : '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  return table;
}

/** Create a Q-value bar element. */
export function createQBar(value: number, minRange = -1, maxRange = 1): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'q-bar';

  const bar = document.createElement('div');
  bar.className = 'bar';

  const fill = document.createElement('div');
  fill.className = `fill ${value >= 0 ? 'positive' : 'negative'}`;

  const range = maxRange - minRange;
  const absWidth = Math.abs(value) / (range / 2) * 50;
  fill.style.width = `${Math.min(50, absWidth)}%`;

  if (value >= 0) {
    fill.style.left = '50%';
  } else {
    fill.style.left = `${50 - Math.min(50, absWidth)}%`;
  }

  bar.appendChild(fill);

  const display = document.createElement('span');
  display.className = 'value';
  display.textContent = value.toFixed(3);
  if (value > 0) display.style.color = 'var(--green)';
  else if (value < 0) display.style.color = 'var(--red)';
  else display.style.color = 'var(--text-secondary)';

  wrapper.append(bar, display);
  return wrapper;
}
