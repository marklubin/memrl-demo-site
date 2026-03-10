export interface ModalConfig {
  title: string;
  body: HTMLElement | string;
  actions: { label: string; primary?: boolean; onClick: () => void }[];
}

export function showModal(config: ModalConfig): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const heading = document.createElement('h3');
  heading.textContent = config.title;
  modal.appendChild(heading);

  if (typeof config.body === 'string') {
    const p = document.createElement('p');
    p.textContent = config.body;
    modal.appendChild(p);
  } else {
    modal.appendChild(config.body);
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  for (const action of config.actions) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    if (action.primary) btn.className = 'primary';
    btn.addEventListener('click', () => {
      action.onClick();
      backdrop.remove();
    });
    actions.appendChild(btn);
  }

  modal.appendChild(actions);
  backdrop.appendChild(modal);

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  document.body.appendChild(backdrop);
  return backdrop;
}

export function showEditModal(
  title: string,
  initialValue: string,
  onSave: (value: string) => void,
): HTMLElement {
  const container = document.createElement('div');

  const textarea = document.createElement('textarea');
  textarea.value = initialValue;
  container.appendChild(textarea);

  return showModal({
    title,
    body: container,
    actions: [
      { label: 'Cancel', onClick: () => {} },
      { label: 'Save', primary: true, onClick: () => onSave(textarea.value) },
    ],
  });
}
