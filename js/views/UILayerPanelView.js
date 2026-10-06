/* ============================================
   UI/UX DESIGNER - UILayerPanelView
   ============================================
   Painel de camadas: a lista de nos do documento, do
   topo da pilha para o fundo, com visibilidad e
   trava por linha.

   A lista e um espelho de `UIDesign.layers`, e nao
   uma fonte: toda acao aqui vira chamada no modelo
   (`selectById`, `toggleNodeVisibility`,
   `toggleNodeLock`, `renameNode`) e o controller
   redesenha. Por isso o painel nao guarda estado
   proprio alem do campo de renomear em edicao.
   ============================================ */

const ICON_BY_TYPE = {
  frame: '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  shape: '<rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor"/>',
  text: '<path fill="currentColor" d="M5 4v3h5.5v12h3V7H19V4H5z"/>'
};

const EYE_ON = '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>';
const EYE_OFF = '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4 4l16 16M9.6 5.3A9.6 9.6 0 0112 5c6.4 0 10 6 10 6a17 17 0 01-3.2 3.7M6.4 7.6A17 17 0 002 11s3.6 6 10 6c1 0 1.9-.1 2.7-.4"/>';
const LOCK_ON = '<path fill="currentColor" d="M7 10V8a5 5 0 0110 0v2h1v10H6V10h1zm2 0h6V8a3 3 0 00-6 0v2z"/>';
const LOCK_OFF = '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M7 10V8a5 5 0 019.5-2M6 10h12v10H6V10z"/>';

export class UILayerPanelView {
  constructor(design, $) {
    this.design = design;
    this.$ = $;
    this.list = null;

    this.onSelectNode = null;      // (id) => void
    this.onToggleVisible = null;   // (id) => void
    this.onToggleLock = null;      // (id) => void
    this.onRename = null;          // (id, name) => void
    this.onRequestEditText = null; // (node) => void
  }

  init() {
    const panel = this.$.designLayers;
    if (!panel) return false;

    panel.textContent = '';
    panel.classList.add('design-layers');

    const header = document.createElement('div');
    header.className = 'design-panel-header';
    header.textContent = 'Camadas';

    this.list = document.createElement('div');
    this.list.className = 'design-layers-list';

    panel.appendChild(header);
    panel.appendChild(this.list);

    this.render();
    return true;
  }

  render() {
    if (!this.list) return;
    this.list.textContent = '';

    const layers = this.design.layers;
    if (!layers.length) {
      const empty = document.createElement('p');
      empty.className = 'design-empty';
      empty.textContent = 'Nenhum elemento ainda. Escolha uma ferramenta e arraste na area de desenho.';
      this.list.appendChild(empty);
      return;
    }

    layers.forEach((item) => this.list.appendChild(this._buildRow(item)));
  }

  _buildRow(item) {
    const row = document.createElement('div');
    row.className = 'design-layer'
      + (item.selected ? ' is-selected' : '')
      + (item.visible ? '' : ' is-hidden');
    row.dataset.id = item.id;
    row.title = item.type + (item.shapeType ? ' (' + item.shapeType + ')' : '');

    const icon = document.createElement('span');
    icon.className = 'design-layer-icon';
    icon.innerHTML = ICON_BY_TYPE[item.type] || ICON_BY_TYPE.shape;

    const name = document.createElement('span');
    name.className = 'design-layer-name';
    name.textContent = item.name;

    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(this._iconButton(item.visible ? EYE_ON : EYE_OFF, item.visible ? 'Ocultar' : 'Mostrar', 'is-visible-toggle',
      () => this.onToggleVisible && this.onToggleVisible(item.id)));
    row.appendChild(this._iconButton(item.locked ? LOCK_ON : LOCK_OFF, item.locked ? 'Destravar' : 'Travar', 'is-lock-toggle',
      () => this.onToggleLock && this.onToggleLock(item.id)));

    row.addEventListener('click', () => {
      if (this.onSelectNode) this.onSelectNode(item.id);
    });

    // Duplo clique renomeia; em texto, o duplo clique ja e o atalho de
    // edicao -- o campo de texto do no abre no painel de propriedades.
    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('.design-layer-action')) return;
      const node = this.design.getNode(item.id);
      if (node && node.type === 'text' && this.onRequestEditText) {
        this.onSelectNode && this.onSelectNode(item.id);
        this.onRequestEditText(node);
        return;
      }
      this._startRename(row, name, item.id);
    });

    return row;
  }

  _iconButton(svg, title, modifier, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'design-layer-action ' + modifier;
    btn.title = title;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14">' + svg + '</svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /** Renomear no lugar: um input na propria linha, Enter confirma, Esc volta. */
  _startRename(row, nameEl, id) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'design-layer-rename';
    input.value = nameEl.textContent;

    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.remove();
      if (commit && value && this.onRename) this.onRename(id, value);
      else this.render();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());

    row.replaceChild(input, nameEl);
    input.focus();
    input.select();
  }
}