import { DesignCodeRenderer } from '../renderers/DesignCodeRenderer.js';

/* ============================================
   UI/UX DESIGNER - UIDesignCodeView
   ============================================
   A aba "Codigo": o frame virando HTML, CSS e
   JavaScript, em tres caixas editaveis.

   A view nao gera codigo -- quem gera e o
   `DesignCodeRenderer`, que e uma funcao pura do
   modelo. Aqui so ha tres responsabilidades:

     1. escolher qual frame virou tela;
     2. mostrar o texto, e deixar editar;
     3. deixar baixar o resultado: so o frame selecionado
        e o que esta dentro dele, num HTML unico, com o
        CSS no `<style>` e -- quando houver -- o
        JavaScript no `<script>`.

   Digitar no textarea NAO regenera o codigo. O que
   voce escreve passa a ser a fonte da verdade, e o
   botao "Gerar" e quem volta ao design -- regerar a
   cada tecla comeria a edicao. Por isso o aviso de
   "o design mudou" avisa que o texto pode estar
   velho, sem trocar nada debaixo dos dedos de quem
   edita.
   ============================================ */

export class UIDesignCodeView {
  constructor(design, $) {
    this.design = design;
    this.$ = $ || {};
    this.root = null;
    this.fields = null;
    this.frameSelect = null;
    this.staleNote = null;
    this.frameId = null;
    this.stale = false;
    this.active = false;

    this.onDownload = null;   // (fileName, text) => void
  }

  init() {
    const host = this.$.designStage;
    if (!host) return false;

    this.root = document.createElement('div');
    this.root.className = 'design-code';
    this.root.hidden = true;

    this.root.appendChild(this._bar());
    this.root.appendChild(this._panels());
    host.appendChild(this.root);
    return true;
  }

  /* ---- Estrutura ---- */

  _bar() {
    const bar = document.createElement('div');
    bar.className = 'design-code-bar';

    const titulo = document.createElement('span');
    titulo.className = 'design-code-title';
    titulo.textContent = 'Tela:';
    bar.appendChild(titulo);

    // Um seletor so quando ha mais de um frame: com um unico frame, o
    // seletor seria ruido -- mas o usuario pode nao saber que o que ele
    // ve e o frame dele.
    this.frameSelect = document.createElement('select');
    this.frameSelect.className = 'design-code-select';
    this.frameSelect.addEventListener('change', () => {
      this.frameId = this.frameSelect.value || null;
      this.generate();
    });
    bar.appendChild(this.frameSelect);

    this.staleNote = document.createElement('span');
    this.staleNote.className = 'design-code-stale';
    bar.appendChild(this.staleNote);

    const gerar = document.createElement('button');
    gerar.type = 'button';
    gerar.className = 'design-code-btn';
    gerar.textContent = 'Gerar';
    gerar.title = 'Gera o codigo de novo a partir do design, trocando o que estiver editado';
    gerar.addEventListener('click', () => this.generate());
    bar.appendChild(gerar);

    const baixar = document.createElement('button');
    baixar.type = 'button';
    baixar.className = 'design-code-btn is-primary';
    baixar.textContent = 'Baixar HTML';
    baixar.title = 'Baixa so o frame selecionado num HTML unico, com o CSS dentro e o JavaScript, se houver';
    baixar.addEventListener('click', () => this._download());
    bar.appendChild(baixar);

    this.empty = document.createElement('p');
    this.empty.className = 'design-empty';
    this.empty.hidden = true;
    bar.appendChild(this.empty);

    return bar;
  }

  _panels() {
    const grid = document.createElement('div');
    grid.className = 'design-code-grid';

    const codeSide = document.createElement('div');
    codeSide.className = 'design-code-editor';
    this.fields = {
      html: this._pane(codeSide, 'HTML'),
      css: this._pane(codeSide, 'CSS'),
      js: this._pane(codeSide, 'JavaScript', 'Opcional: o que voce escrever aqui vai no <script> do arquivo baixado')
    };
    grid.appendChild(codeSide);
    return grid;
  }

  _pane(parent, title, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'design-code-pane';

    const label = document.createElement('span');
    label.className = 'design-code-pane-title';
    label.textContent = title;
    wrap.appendChild(label);

    const area = document.createElement('textarea');
    area.className = 'design-code-text';
    area.spellcheck = false;
    area.setAttribute('aria-label', 'Codigo ' + title);
    if (placeholder) area.placeholder = placeholder;
    wrap.appendChild(area);

    parent.appendChild(wrap);
    return area;
  }

  /* ---- Estado ---- */

  /** Todos os frames, na ordem do design. */
  frames() {
    return DesignCodeRenderer.frames(this.design);
  }

  /** O frame mostrado agora: o escolhido, ou o selecionado, ou o primeiro. */
  currentFrame() {
    const frames = this.frames();
    if (!frames.length) return null;
    const chosen = frames.find((frame) => frame.id === this.frameId);
    if (chosen) return chosen;
    const selected = this.design.selected;
    if (selected && selected.type === 'frame') return selected;
    return frames[0];
  }

  /**
   * O design mudou. A view nao regenera nada sozinha -- isso comecaria a
   * comer edicao a cada arrasto de no -- so acende o aviso.
   */
  markStale() {
    this.stale = true;
    // A lista de frames tambem se atualiza aqui: quem esta na aba de
    // codigo e cria um frame novo tem que ver o nome dele no seletor,
    // sem precisar sair da aba para a lista deixar de estar velha.
    if (this.frameSelect) this._syncFrameList();
    this._syncBar();
  }

  setActive(active) {
    this.active = active === true;
    if (!this.root) return;
    this.root.hidden = !this.active;
    if (this.active) this._syncBar();
  }

  /** (Re)preenche os tres campos a partir do design. */
  generate() {
    if (!this.fields) return false;
    this._syncFrameList();

    const frame = this.currentFrame();
    if (!frame) {
      this._setFields({ html: '', css: '', js: '' });
      this._syncBar();
      return false;
    }

    this.frameId = frame.id;
    const screen = DesignCodeRenderer.forFrame(this.design, frame);
    this._setFields(screen);
    this.stale = false;
    this._syncBar();
    return true;
  }

  _setFields(screen) {
    this.fields.html.value = screen.html;
    this.fields.css.value = screen.css;
    this.fields.js.value = screen.js;
  }

  /** Reconstroi a lista de frames, preservando a escolha quando ela existe. */
  _syncFrameList() {
    const frames = this.frames();
    const select = this.frameSelect;
    const anterior = this.frameId;
    select.textContent = '';

    frames.forEach((frame) => {
      const option = document.createElement('option');
      option.value = frame.id;
      option.textContent = frame.name;
      select.appendChild(option);
    });

    if (frames.length > 1) {
      select.hidden = false;
      if (anterior && frames.some((frame) => frame.id === anterior)) select.value = anterior;
      else {
        const frame = this.currentFrame();
        select.value = frame ? frame.id : '';
      }
    } else {
      // Um frame so: o seletor seria uma pista falsa.
      select.hidden = true;
      select.value = frames.length === 1 ? frames[0].id : '';
    }
  }

  _syncBar() {
    if (!this.staleNote) return;
    const frames = this.frames();
    this.empty.hidden = frames.length > 0;
    if (!frames.length) {
      this.empty.textContent = 'Crie um Frame para gerar o codigo da tela.';
      this.staleNote.textContent = '';
      return;
    }
    this.staleNote.textContent = this.stale ? 'O design mudou -- o codigo pode estar velho' : '';
  }

  /**
   * O botao de baixar entrega o frame num arquivo so, com tudo dentro: o
   * `DesignCodeRenderer.document` monta o HTML com o CSS no `<style>` e,
   * se houver JavaScript escrito, o `<script>` depois da tela. O texto
   * usado e o das caixas em edicao, exatamente como estao agora -- o que
   * esta dentro do frame selecionado, e mais nada.
   */
  _download() {
    const frame = this.currentFrame();
    if (!frame) return;
    const text = DesignCodeRenderer.document({
      title: frame.name,
      html: this.fields.html.value,
      css: this.fields.css.value,
      js: this.fields.js.value
    });
    if (this.onDownload) this.onDownload(frame.name + '.html', text);
  }
}
