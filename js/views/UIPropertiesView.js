import { UIText } from '../models/UIText.js';

/* ============================================
   UI/UX DESIGNER - UIPropertiesView
   ============================================
   Inspector do no selecionado: geometria, pintura e,
   no texto, o proprio conteudo.

   O texto e editado aqui, e nao sobre o canvas: o no
   continua sendo um `<text>` do SVG, entao o que sai no
   export e o que esta no arquivo -- um `contenteditable`
   por cima introduziria HTML no meio de um documento
   vetorial.

   O painel nao escreve no modelo: ele emite
   `onChange(prop, value)` e o controller aplica. E
   `render()` so redesenha quando o no selecionado muda
   de identidade, para nao roubar o foco de quem esta
   digitando num campo.
   ============================================ */

export class UIPropertiesView {
  constructor(design, $) {
    this.design = design;
    this.$ = $;
    this.body = null;
    this.renderedId = null;

    this.onChange = null;          // (prop, value) => void
    this.onCommit = null;          // () => void
    this.onDelete = null;          // () => void
    this.onRequestEditText = null; // (node) => void
  }

  init() {
    const panel = this.$.designProperties;
    if (!panel) return false;

    panel.textContent = '';
    panel.classList.add('design-properties');

    const header = document.createElement('div');
    header.className = 'design-panel-header';
    header.textContent = 'Propriedades';

    this.body = document.createElement('div');
    this.body.className = 'design-properties-body';

    // Um listener so no corpo: os campos sao recriados a cada render, e um
    // listener por campo vazaria a cada troca de no.
    this.body.addEventListener('input', (e) => this._onFieldEvent(e));
    this.body.addEventListener('change', (e) => this._onFieldEvent(e));

    panel.appendChild(header);
    panel.appendChild(this.body);

    this.render(true);
    return true;
  }

  /** Foca o campo de conteudo -- usado pelo duplo clique no texto. */
  focusText() {
    const field = this.body && this.body.querySelector('[data-prop="text"]');
    if (!field) return false;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    return true;
  }

  /**
   * Desenha o painel do no selecionado.
   *
   * Ha dois casos, e a distincao importa: quando o no selecionado muda, os
   * campos sao outros e precisam ser remontados; quando continua o mesmo, so
   * os valores sao sincronizados no lugar. Sem isso, um arrasto no canvas
   * deixaria X, Y e tamanho mostrando a geometria antiga -- o painel viraria
   * mentira. E remontar a cada tecla do usuario roubaria o foco do campo,
   * por isso a sincronizacao preserva o elemento em edicao.
   */
  render(force = false) {
    if (!this.body) return;

    const node = this.design.selected;
    const id = node ? node.id : null;
    if (!force && id === this.renderedId) {
      this._syncFields(node);
      return;
    }
    this.renderedId = id;

    this.body.textContent = '';

    if (!node) {
      this.body.appendChild(this._hint('Selecione um elemento para ver as propriedades.'));
      return;
    }
    if (node.locked) {
      this.body.appendChild(this._hint('Elemento travado: destrave na lista de camadas para edita-lo.'));
    }

    this.body.appendChild(this._group('Posicao e tamanho', [
      this._text(node.name, 'name', 'Nome'),
      this._number(node.x, 'x', 'X'),
      this._number(node.y, 'y', 'Y'),
      this._number(node.width, 'width', 'Largura'),
      this._number(node.height, 'height', 'Altura'),
      this._number(node.rotation, 'rotation', 'Rotacao', { step: 1, min: 0 })
    ]));

    if (node.type === 'frame') {
      this.body.appendChild(this._group('Frame', [
        this._color(node.background, 'background', 'Fundo')
      ]));
    }

    if (node.type === 'shape') {
      const paint = [
        this._select(node.shapeType, 'shapeType', 'Forma', [
          { value: 'rect', label: 'Retangulo' },
          { value: 'ellipse', label: 'Elipse' },
          { value: 'line', label: 'Linha' }
        ]),
        this._checkbox(node.stroke !== 'none', 'strokeEnabled', 'Contorno'),
        this._color(node.stroke === 'none' ? '#1a1a1a' : node.stroke, 'stroke', 'Cor do contorno'),
        this._checkbox(node.fill !== 'none', 'fillEnabled', 'Preenchimento'),
        this._color(node.fill === 'none' ? '#ffffff' : node.fill, 'fill', 'Cor do preenchimento'),
        this._number(node.strokeWidth, 'strokeWidth', 'Espessura', { min: 0, step: 0.5 })
      ];
      if (node.shapeType === 'rect') {
        // Um campo por canto: o que nao e arredondado fica em 90 graus.
        paint.push(
          this._number(node.radiusTl, 'radiusTl', 'Sup. esq.', { min: 0 }),
          this._number(node.radiusTr, 'radiusTr', 'Sup. dir.', { min: 0 }),
          this._number(node.radiusBr, 'radiusBr', 'Inf. dir.', { min: 0 }),
          this._number(node.radiusBl, 'radiusBl', 'Inf. esq.', { min: 0 })
        );
      }
      this.body.appendChild(this._group('Forma', paint));
    }

    if (node.type === 'text') {
      this.body.appendChild(this._group('Conteudo', [
        this._textarea(node.text, 'text', 'Texto')
      ]));
      this.body.appendChild(this._group('Tipografia', [
        this._number(node.fontSize, 'fontSize', 'Corpo', { min: 1 }),
        this._select(node.fontWeight, 'fontWeight', 'Peso', [
          { value: '300', label: 'Leve' },
          { value: '400', label: 'Normal' },
          { value: '500', label: 'Medio' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
          { value: '800', label: 'Extrabold' }
        ]),
        this._select(node.fontFamily, 'fontFamily', 'Familia',
          UIText.FONT_FAMILIES.map((font) => ({ value: font, label: font.split(',')[0].replace(/'/g, '') }))),
        this._color(node.color, 'color', 'Cor'),
        this._select(node.align, 'align', 'Alinhamento', [
          { value: 'left', label: 'Esquerda' },
          { value: 'center', label: 'Centro' },
          { value: 'right', label: 'Direita' }
        ]),
        this._number(node.lineHeight, 'lineHeight', 'Entrelinha', { min: 0.6, max: 4, step: 0.1 })
      ]));
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'design-btn design-danger';
    remove.textContent = 'Remover elemento';
    remove.addEventListener('click', () => this.onDelete && this.onDelete());
    this.body.appendChild(remove);
  }

  /* ---- Campos ---- */

  /**
   * Escreve o valor do modelo no campo, sem recria-lo.
   *
   * O campo com foco e pulado de proposito: e o que o usuario esta digitando,
   * e o `changeProperty` ja aplicou o que ele escreveu.
   */
  _syncFields(node) {
    if (!node) return;

    this.body.querySelectorAll('[data-prop]').forEach((field) => {
      if (field === document.activeElement) return;

      const value = UIPropertiesView.valueFor(node, field.dataset.prop);
      if (value === undefined || value === null) return;

      if (field.type === 'checkbox') {
        field.checked = value === true;
        return;
      }
      const next = String(value);
      if (field.value !== next) field.value = next;
    });
  }

  /** `prop` do painel -> valor no no. Os derivados sao os dois checkbox de tinta. */
  static valueFor(node, prop) {
    if (prop === 'strokeEnabled') return node.stroke !== 'none';
    if (prop === 'fillEnabled') return node.fill !== 'none';
    return node[prop];
  }

  _onFieldEvent(e) {
    const field = e.target.closest('[data-prop]');
    if (!field) return;

    const prop = field.getAttribute('data-prop');
    const value = this._readValue(field);
    if (value === null) return;

    if (this.onChange) this.onChange(prop, value);
    // `change` so dispara na saida do campo; `input` dispara a cada tecla.
    // O commit do historico e do desenho fica no `input`.
    if (e.type === 'change' && this.onCommit) this.onCommit();
  }

  _readValue(field) {
    if (field.type === 'checkbox') return field.checked;
    if (field.type === 'number' || field.type === 'range') {
      const value = parseFloat(field.value);
      return Number.isFinite(value) ? value : null;
    }
    return field.value;
  }

  _group(title, fields) {
    const group = document.createElement('div');
    group.className = 'design-prop-group';

    const label = document.createElement('span');
    label.className = 'design-prop-group-title';
    label.textContent = title;
    group.appendChild(label);

    fields.forEach((field) => group.appendChild(field));
    return group;
  }

  _hint(text) {
    const hint = document.createElement('p');
    hint.className = 'design-empty';
    hint.textContent = text;
    return hint;
  }

  _wrap(labelText, control) {
    const row = document.createElement('label');
    row.className = 'design-field';

    const name = document.createElement('span');
    name.className = 'design-field-label';
    name.textContent = labelText;

    row.appendChild(name);
    row.appendChild(control);
    return row;
  }

  _text(value, prop, labelText) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'design-input';
    input.value = value;
    input.dataset.prop = prop;
    return this._wrap(labelText, input);
  }

  _number(value, prop, labelText, options = {}) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'design-input';
    input.value = Math.round(value * 100) / 100;
    input.dataset.prop = prop;
    if (options.step !== undefined) input.step = options.step;
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
    return this._wrap(labelText, input);
  }

  _color(value, prop, labelText) {
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'design-input design-color';
    // `<input type=color>` nao aceita `none`: quem decide se a tinta existe
    // e o checkbox ao lado, e o controller traduz.
    input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
    input.dataset.prop = prop;
    return this._wrap(labelText, input);
  }

  _checkbox(checked, prop, labelText) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'design-checkbox';
    input.checked = checked === true;
    input.dataset.prop = prop;
    return this._wrap(labelText, input);
  }

  /** Campo de um `prop`, para o controller precisar do valor vizinho. */
  getField(prop) {
    return this.body ? this.body.querySelector('[data-prop="' + prop + '"]') : null;
  }

  _select(value, prop, labelText, options) {
    const select = document.createElement('select');
    select.className = 'design-input';
    select.dataset.prop = prop;

    options.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    });
    select.value = String(value);

    return this._wrap(labelText, select);
  }

  _textarea(value, prop, labelText) {
    const area = document.createElement('textarea');
    area.className = 'design-input design-textarea';
    area.rows = 3;
    area.value = value;
    area.dataset.prop = prop;
    return this._wrap(labelText, area);
  }
}