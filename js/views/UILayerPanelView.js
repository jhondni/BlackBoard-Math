/* ============================================
   UI/UX DESIGNER - UILayerPanelView
   ============================================
   Painel de camadas: a lista de nos do documento, do
   topo da pilha para o fundo, com visibilidad e
   trava por linha.

   A lista e um espelho de `UIDesign.layers`, e nao
   uma fonte: toda acao aqui vira chamada no modelo
   (`selectById`, `toggleNodeVisibility`,
   `toggleNodeLock`, `renameNode`, `moveNodeTo`) e o
   controller redesenha. Por isso o painel nao guarda
   estado proprio alem do campo de renomear em edicao
   e do arrasto em andamento.

   Reordenar e arrastar, com Pointer Events como o
   resto do modulo. O arrasto so comeca depois de alguns
   pixels, senao o clique que seleciona e o duplo clique
   que renomeia param de funcionar.
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

/** Percorridos antes do clique virar arrasto, em px. */
const DRAG_THRESHOLD = 4;
/** Perto da borda da lista o arrasto rola sozinho, em px. */
const EDGE_ZONE = 24;
const EDGE_STEP = 8;

export class UILayerPanelView {
  constructor(design, $) {
    this.design = design;
    this.$ = $;
    this.list = null;
    this.drag = null;
    this.indicator = null;

    this.onSelectNode = null;      // (id) => void
    this.onToggleVisible = null;   // (id) => void
    this.onToggleLock = null;      // (id) => void
    this.onRename = null;          // (id, name) => void
    this.onMoveNode = null;        // (id, panelIndex) => void
    this.onRequestEditText = null; // (node) => void

    // referencias estaveis: as linhas sao recriadas a cada render,
    // e o arrasto precisa tirar o listener de cima da linha certa.
    this._onDragMove = (e) => this._dragMove(e);
    this._onDragEnd = (e) => this._dragEnd(e);
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
    if (this.drag) this._cancelDrag();
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
      if (this._swallowClick) {
        this._swallowClick = false;
        return;
      }
      if (this.onSelectNode) this.onSelectNode(item.id);
    });

    row.addEventListener('pointerdown', (e) => this._dragStart(e, row, item.id));

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

  /* ---- Reordenar por arrasto ---- */

  /**
   * Comeca um arrasto *possivel*: os listeners vao na propria linha
   * e o ponteiro so e capturado quando o arrasto de fato comeca.
   * Sem isso o arrasto morre no primeiro pixel fora da linha, que
   * tem meia duzia de altura.
   */
  _dragStart(e, row, id) {
    if (this.drag || e.button !== 0) return;
    if (e.target.closest('.design-layer-action, .design-layer-rename')) return;

    this.drag = {
      id,
      row,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      target: 0,
      ghost: null
    };

    row.addEventListener('pointermove', this._onDragMove);
    row.addEventListener('pointerup', this._onDragEnd);
    row.addEventListener('pointercancel', this._onDragEnd);
  }

  _dragMove(e) {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (!drag.active) {
      const dx = Math.abs(e.clientX - drag.startX);
      const dy = Math.abs(e.clientY - drag.startY);
      if (dx + dy < DRAG_THRESHOLD) return;
      this._dragActivate();
    }

    e.preventDefault();
    drag.ghost.style.transform = 'translate(' + (e.clientX + 12) + 'px,' + (e.clientY + 10) + 'px)';

    const target = this._dropIndexFor(e.clientY);
    if (target !== drag.target) {
      drag.target = target;
      this._showIndicator(target);
    }
    this._autoScroll(e.clientY);
  }

  _dragActivate() {
    const drag = this.drag;
    drag.active = true;
    drag.row.classList.add('is-dragging');
    this.list.classList.add('is-reordering');

    const ghost = drag.row.cloneNode(true);
    ghost.className = 'design-layer is-ghost';
    ghost.style.width = drag.row.offsetWidth + 'px';
    document.body.appendChild(ghost);
    drag.ghost = ghost;

    this.indicator = document.createElement('div');
    this.indicator.className = 'design-drop';

    if (drag.row.setPointerCapture) {
      try {
        drag.row.setPointerCapture(drag.pointerId);
      } catch {
        // navegador sem captura: o arrasto segue pelos eventos da linha
      }
    }
  }

  /**
   * Indice de destino na lista *sem* a linha arrastada, que e o que
   * `moveNodeTo` espera. A faixa acima da metade da linha aponta o
   * destino; abaixo de todas as linhas, o fundo da pilha.
   */
  _dropIndexFor(y) {
    const rows = this._otherRows();
    for (let i = 0; i < rows.length; i += 1) {
      const box = rows[i].getBoundingClientRect();
      if (y < box.top + box.height / 2) return i;
    }
    return rows.length;
  }

  /** Linhas da lista fora a linha arrastada. */
  _otherRows() {
    return Array.from(this.list.querySelectorAll('.design-layer'))
      .filter((row) => row !== this.drag.row);
  }

  _showIndicator(index) {
    this.list.insertBefore(this.indicator, this._otherRows()[index] || null);
  }

  _autoScroll(y) {
    const box = this.list.getBoundingClientRect();
    if (y < box.top + EDGE_ZONE) this.list.scrollTop -= EDGE_STEP;
    else if (y > box.bottom - EDGE_ZONE) this.list.scrollTop += EDGE_STEP;
  }

  _dragEnd(e) {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;

    const drag = this._clearDrag();
    if (!drag.active) return;

    // Gesto cancelado pelo navegador ou pelo sistema: some com o
    // rastro, sem mover e sem armar a trava de clique -- se armasse,
    // o proximo clique do usuario seria engolido.
    if (e.type === 'pointercancel') return;

    // O `click` de compatibilidade e disparado na mesma tarefa do
    // `pointerup`, entao a flag e necessaria para o arrasto nao
    // acabar selecionando a camada de origem.
    this._swallowClick = true;
    setTimeout(() => { this._swallowClick = false; }, 0);

    if (this.onMoveNode) this.onMoveNode(drag.id, drag.target);
  }

  /** Aborta o arrasto sem mover nada: o redesenho chegou antes dele. */
  _cancelDrag() {
    this._clearDrag();
  }

  /** Solta o arrasto, limpa rastro e devolve o que estava em curso. */
  _clearDrag() {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return null;

    drag.row.removeEventListener('pointermove', this._onDragMove);
    drag.row.removeEventListener('pointerup', this._onDragEnd);
    drag.row.removeEventListener('pointercancel', this._onDragEnd);

    if (drag.row.releasePointerCapture) {
      try {
        drag.row.releasePointerCapture(drag.pointerId);
      } catch {
        // ponteiro ja liberado pelo navegador
      }
    }

    drag.row.classList.remove('is-dragging');
    if (this.list) this.list.classList.remove('is-reordering');
    if (drag.ghost) drag.ghost.remove();
    if (this.indicator) {
      this.indicator.remove();
      this.indicator = null;
    }
    return drag;
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