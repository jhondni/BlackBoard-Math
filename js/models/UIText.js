import { UINode } from './UINode.js';

/* ============================================
   UI/UX DESIGNER - UIText
   ============================================
   Texto do design. Continua sendo um no SVG: o
   conteudo e editado pelo painel de propriedades
   (duplo clique no no), e nao por um `contenteditable`
   sobreposto -- o SVG exportado continua siendo a
   fonte da verdade e nao carrega HTML junto.

   A altura e derivada das linhas enquanto
   `autoHeight` vale, para o texto crescer com o
   que se escreve em vez de cortado num retangulo
   de altura fixa. Quem quiser altura manual desliga
   o flag e redimensiona a mao.
   ============================================ */

const FALLBACK_FONT = "'Inter', system-ui, sans-serif";

export class UIText extends UINode {
  constructor(props = {}) {
    const {
      text = 'Texto',
      fontSize = 16,
      fontFamily = FALLBACK_FONT,
      fontWeight = 400,
      color = '#1a1a1a',
      align = 'left',
      lineHeight = 1.4,
      autoHeight = true
    } = props;

    super({ type: 'text', name: 'Texto', width: 160, height: 24, ...props });

    this.text = typeof text === 'string' ? text : 'Texto';
    this.fontSize = Math.max(1, UINode.toNumber(fontSize, 16));
    this.fontFamily = UINode.toText(fontFamily, FALLBACK_FONT);
    this.fontWeight = UIText.normalizeWeight(fontWeight);
    this.color = UINode.toText(color, '#1a1a1a');
    this.align = UIText.ALIGN.includes(align) ? align : 'left';
    this.lineHeight = Math.min(4, Math.max(0.6, UINode.toNumber(lineHeight, 1.4)));
    this.autoHeight = autoHeight !== false;

    if (this.autoHeight) this.fitHeight();
  }

  static get ALIGN() {
    return ['left', 'center', 'right'];
  }

  static get FONT_FAMILIES() {
    return [
      "'Inter', system-ui, sans-serif",
      "'JetBrains Mono', monospace",
      "Georgia, 'Times New Roman', serif",
      "'Trebuchet MS', sans-serif",
      "system-ui, sans-serif"
    ];
  }

  static normalizeWeight(value) {
    const n = Math.round(UINode.toNumber(value, 400) / 100) * 100;
    return Math.min(900, Math.max(100, n));
  }

  static fromJSON(data) {
    return new UIText(data);
  }

  get lines() {
    return this.text.split('\n');
  }

  /** Altura que o texto ocupa: linhas x corpo x entrelinha. */
  measureHeight() {
    return Math.max(this.fontSize * this.lineHeight, this.lines.length * this.fontSize * this.lineHeight);
  }

  /** Reaplica a altura medida. Nao mexe em no travado. */
  fitHeight() {
    if (this.locked) return this.height;
    this.height = Math.max(this.minHeight, this.measureHeight());
    return this.height;
  }

  setText(value) {
    this.text = typeof value === 'string' ? value : '';
    if (this.autoHeight) this.fitHeight();
  }

  toJSON() {
    return {
      ...super.toJSON(),
      text: this.text,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: this.fontWeight,
      color: this.color,
      align: this.align,
      lineHeight: this.lineHeight,
      autoHeight: this.autoHeight
    };
  }
}