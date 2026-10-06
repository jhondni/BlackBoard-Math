import { UINode } from './UINode.js';
import { UIFrame } from './UIFrame.js';

/* ============================================
   UI/UX DESIGNER - UIImage
   ============================================
   Uma imagem de bitmap dentro do design.

   O `src` e um data URL (o arquivo escolhido vira
   base64 dentro do proprio `.uidesign.json`). E a
   consequencia de uma escolha, nao um descuido: o
   arquivo de design continua valendo sozinho, sem
   depender de uma pasta de imagens ao lado. O preco
   e o tamanho -- base64 cresce uns 33% sobre os
   bytes da imagem, e a imagem viaja tambem no
   `.svg` exportado, porque o export reusa o mesmo
   desenho do canvas.

   Nao e `UIShape` com um atributo a mais: forma e
   imagem nao dividem o mesmo campo `radii`, e o
   SVG nao da `rx` a um `<image>` -- arredondar
   exigiria um clipPath. Os cantos da imagem sao
   retos, e o que ela guarda e o AJUSTE, que e o
   `preserveAspectRatio`: a caixa e o no, e o
   navegador e quem decide como o bitmap cabe
   (ou nao) dentro dela.

   `naturalWidth`/`naturalHeight` sao o tamanho
   original do arquivo. O no nao e obrigado a ter
   esse tamanho -- o usuario arrasta a caixa que
   quer -- mas sem eles o painel nao consegue dizer
   o que a imagem perderia ao ser arrastada para
   outro tamanho.
   ============================================ */

export class UIImage extends UIFrame {
  /** Ajuste -> `preserveAspectRatio`. "Caber" nunca distorce a imagem. */
  static FITS = {
    meet: 'xMidYMid meet',
    slice: 'xMidYMid slice',
    none: 'none'
  };

  constructor(props = {}) {
    const { src = '', fit = 'meet', naturalWidth = 0, naturalHeight = 0 } = props;
    super({ type: 'image', name: 'Imagem', width: 240, height: 160, ...props });

    this.src = UINode.toText(src, '');
    this.fit = UIImage.normalizeFit(fit);
    this.naturalWidth = Math.max(0, UINode.toNumber(naturalWidth, 0));
    this.naturalHeight = Math.max(0, UINode.toNumber(naturalHeight, 0));
  }

  static normalizeFit(value) {
    return Object.prototype.hasOwnProperty.call(UIImage.FITS, value) ? value : 'meet';
  }

  static fromJSON(data) {
    return new UIImage(data);
  }

  setFit(value) {
    this.fit = UIImage.normalizeFit(value);
  }

  /** Imagem sem `src`: o node vira uma caixa tracejada, nao um buraco. */
  get isEmpty() {
    return !this.src;
  }

  get preserveAspectRatio() {
    return UIImage.FITS[this.fit];
  }

  toJSON() {
    return {
      ...super.toJSON(),
      src: this.src,
      fit: this.fit,
      naturalWidth: this.naturalWidth,
      naturalHeight: this.naturalHeight
    };
  }
}
