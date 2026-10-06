import { UINode } from './UINode.js';

/* ============================================
   UI/UX DESIGNER - UIFrame
   ============================================
   O frame e o artboard: a moldura que da nome ao
   design. Ele entra na lista de nos como os demais
   (a ordem em `UIDesign.nodes` e o z), e nao tem
   filho -- a pertinencia a um frame ainda nao faz
   parte do MVP.
   ============================================ */

export class UIFrame extends UINode {
  constructor(props = {}) {
    const { background = '#ffffff', clipContent = false } = props;
    super({ type: 'frame', name: 'Frame', width: 480, height: 320, ...props });
    this.background = UINode.toText(background, '#ffffff');
    this.clipContent = clipContent === true;
  }

  static fromJSON(data) {
    return new UIFrame(data);
  }

  setBackground(color) {
    this.background = UINode.toText(color, this.background);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      background: this.background,
      clipContent: this.clipContent
    };
  }
}