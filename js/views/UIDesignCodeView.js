import { DesignCodeRenderer } from '../renderers/DesignCodeRenderer.js';

/* ============================================
   UI/UX DESIGNER - UIDesignCodeView
   ============================================
   A aba "Codigo": o frame virando HTML, CSS e
   JavaScript, com o preview ao lado e o texto
   editavel.

   A view nao gera codigo -- quem gera e o
   `DesignCodeRenderer`, que e uma funcao pura do
   modelo. Aqui so ha tres responsabilidades:

     1. escolher qual frame virou tela;
     2. mostrar o texto, e deixar editar;
     3. mostrar o resultado num `<iframe>`.

   O preview e um `srcdoc`, e nao uma div: o
   `style.css` do app tem quase mil linhas de CSS
   para o modulo, e se a pagina gerada herdasse
   qualquer um deles o preview mentiria -- a tela
   apareceria com as cores do editor, e nao as do
   design. O `srcdoc` tambem da o que o Figma da:
   o codigo que voce ve e o codigo que roda.

   Digitar no textarea NAO regenera o codigo. O que
   voce escreve passa a ser a fonte da verdade, e o
   preview e atualizado a partir do seu texto. Se
   digitar regenerasse, a aba comeria a edicao a
   cada tecla. Por isso o botao "Gerar" existe e e
   explicito -- e o aviso de "o design mudou" avisa
   que o texto pode estar velho, sem trocar nada
   debaixo dos dedos de quem edita.
   ============================================ */

/** Espera a digitacao parar antes de remontar o preview. */
const PREVIEW_DELAY_MS = 250;

export class UIDesignCodeView {
  constructor(design, $) {
    this.design = design;
    this.$ = $ || {};
    this.root = null;
    this.fields = null;
    this.preview = null;
    this.frameSelect = null;
    this.staleNote = null;
    this.frameId = null;
    this.stale = false;
    this.timer = null;
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
      js: this._pane(codeSide, 'JavaScript')
    };
    grid.appendChild(codeSide);

    const previewSide = document.createElement('div');
    previewSide.className = 'design-code-preview-side';
    const label = document.createElement('span');
    label.className = 'design-code-title';
    label.textContent = 'Preview';
    previewSide.appendChild(label);

    // `sandbox` sem `allow-scripts` seria mais apertado, mas o JS gerado
    // (os botoes de visibilidade) precisa rodar -- e e exatamente esse o
    // JS que a aba promete mostrar.
    this.preview = document.createElement('iframe');
    this.preview.className = 'design-code-preview';
    this.preview.title = 'Preview da tela gerada';
    this.preview.setAttribute('sandbox', 'allow-scripts');
    previewSide.appendChild(this.preview);

    grid.appendChild(previewSide);
    return grid;
  }

  _pane(parent, title) {
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
    area.addEventListener('input', () => this._onEdit());
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
    this._refresh();
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

  _onEdit() {
    this._schedulePreview();
  }

  _schedulePreview() {
    if (this.timer) clearTimeout(this.timer);
    // Debounce: digitar rapido remontaria o iframe a cada tecla, e o
    // preview piscaria sem parar.
    this.timer = setTimeout(() => this._refresh(), PREVIEW_DELAY_MS);
  }

  /** O preview vem do TEXTO dos campos, nunca do design. */
  _refresh() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.preview || !this.fields) return;
    const html = this.fields.html.value;
    const css = this.fields.css.value;
    const js = this.fields.js.value;
    this.preview.srcdoc = DesignCodeRenderer.document({ title: '', html, css, js });
  }

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
