/* ============================================
   UI/UX DESIGNER - DesignCodeRenderer
   ============================================
   Traduz um frame do design em HTML, CSS e
   JavaScript -- o mesmo desenho, em vez de SVG.

   Isso e um gerador, nao um estado: recebe o design
   e devolve texto. Nao guarda nada, nao desenha
   nada, e nao depende do DOM. Por isso o mesmo
   arquivo serve para as tres caixas da aba Codigo e
   para o botao de baixar.

   ---- O que pertence a tela de um frame ----

   O modelo nao tem pai e filho: `UIDesign.nodes` e
   uma lista plana, e o proprio `UIFrame` avisa que a
   pertinencia a um frame ainda nao faz parte do
   MVP. A regra aqui e GEOMETRICA, e o arquivo baixado
   e so o frame:

   - quem esta inteiro dentro de um frame pertence a
     ele, e quando ha frame dentro de frame vale o mais
     interno;
   - quem cruza a borda pertence ao frame onde mais
     cabe, e a tela o recorta com `overflow: hidden` --
     entra no codigo, mas sai cortado, so com a parte
     de dentro;
   - quem nao toca nenhum frame nao entra em nenhum
     arquivo.

   O preco dessa escolha, que vale mais que ela: e um
   palpite espacial, nao uma hierarquia. Mover um no
   para fora do frame muda o codigo gerado sem ninguem
   pedir. Em troca, nada do que ja funciona precisa
   mudar -- criacao, selecao, ordem das camadas e
   arquivo seguem intactos.

   ---- Por que os elementos sao irmãos ----

   Todos os nos sao posicionados com as coordenadas do
   DESIGN, nao do pai. Um no dentro de um frame dentro
   de outro tem coordenada do canvas, e nao do frame
   que o contem. Entao o codigo gerado e chato: todo
   elemento e filho direto da tela, com `left`/`top`
   calculados na origem do .screen -- o canto do frame
   em questao e subtraido de cada medida (`cssFor`
   recebe a origem). E o que faz o que o canvas mostra
   dentro do frame continuar dentro do .screen quando o
   frame nao esta em (0,0).    Hierarquia de pai de verdade
   so viria com frame dentro de frame usando o mais
   externo, e nada aqui precisa disso agora.

   ---- Pastas com tag ----

   Uma pasta do painel nao muda o codigo por existir: as
   linhas continuam sendo so organizacao. A excecao e a
   `tag` da pasta (`GroupTagCatalog`). Com tag, o frame
   inteiro ate agora chapado ganha UM nivel: os membros
   da pasta saem da lista de irmaos e entram num elemento
   real daquela tag (`<button>`, `<a>`, `<input>`...),
   posicionado na bbox que envolve os membros. O resto da
   arvore segue chapado.

   O `nX` do embrulho e da mesma sequencia dos nos -- a
   numeracao e a ordem em que os elementos aparecem no
   DOM, com o embrulho antes dos filhos --, entao o CSS
   fica uma lista so. Cada membro ja tem as coordenadas do
   design; a unica diferenca e que a `origin` deles passa a
   ser a bbox da pasta (e nao mais o canto do frame), para
   o `left`/`top` sair relativo ao embrulho. O embrulho em
   si e posicionado relativo ao frame, como qualquer no.

   Elemento que nao aceita filhos (`input`) nao embrulha
   nada: o texto do primeiro membro de texto vira o
   `placeholder` e os outros membros ficam de fora.
   ============================================ */

import { findGroupTag } from './GroupTagCatalog.js';

/** Escapa texto que vai para dentro de um atributo ou entre tags. */
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `12.5` vira `12.5px`; arredonda para o codigo nao ficar cheio de ruido. */
function px(value) {
  const n = Math.round(Number(value) * 100) / 100;
  return n + 'px';
}

/** Recua cada linha de um trecho -- o codigo gerado fica legivel. */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return String(text).split('\n').map((line) => (line ? pad + line : line)).join('\n');
}

export class DesignCodeRenderer {
  /** Todos os frames do design, na ordem em que estao na lista (o z). */
  static frames(design) {
    return design.nodes.filter((node) => node.type === 'frame');
  }

  /** O no esta inteiro dentro do frame? */
  static contains(outer, inner) {
    return inner.x >= outer.x
      && inner.y >= outer.y
      && inner.x + inner.width <= outer.x + outer.width
      && inner.y + inner.height <= outer.y + outer.height;
  }

  /** As caixas se sobrepoe? Borda so encostando nao conta. */
  static intersects(a, b) {
    return a.x < b.x + b.width
      && b.x < a.x + a.width
      && a.y < b.y + b.height
      && b.y < a.y + a.height;
  }

  /** Area da intersecao das duas caixas, em px de design. */
  static overlapArea(a, b) {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /**
   * O frame a que o no pertence, ou `null` se ele nao toca nenhum.
   *
   * Vale inteiro antes de valer em parte: quem esta 100% dentro de um
   * frame e do mais interno (menor area entre os que o contem -- area, e
   * nao ordem na lista, porque a lista e o z). So quem nao esta inteiro
   * em lugar nenhum cai no desempate por sobreposicao, com o maior pedaco
   * de si dentro do frame; empatado, fica o primeiro da lista, para o
   * codigo nao depender do acaso.
   */
  static innermostFrame(design, node) {
    const frames = DesignCodeRenderer.frames(design).filter((frame) => frame !== node);

    let best = null;
    for (const frame of frames) {
      if (!DesignCodeRenderer.contains(frame, node)) continue;
      if (!best || frame.width * frame.height < best.width * best.height) best = frame;
    }
    if (best) return best;

    let bestArea = 0;
    for (const frame of frames) {
      if (!DesignCodeRenderer.intersects(frame, node)) continue;
      const area = DesignCodeRenderer.overlapArea(frame, node);
      if (area > bestArea) {
        best = frame;
        bestArea = area;
      }
    }
    return best;
  }

  /** Os nos da tela deste frame, na ordem em que aparecem no design. */
  static contentsOf(design, frame) {
    return design.nodes.filter(
      (node) => node !== frame && DesignCodeRenderer.innermostFrame(design, node) === frame
    );
  }

  /* ---- Agrupar por tag ----
     Ver a secao "Pastas com tag" no cabecalho. Um no entra num embrulho
     quando a pasta dele tem uma tag conhecida; as pastas sao de um nivel
     so (nao ha pasta dentro de pasta), entao os membros nunca sao outro
     embrulho. */

  /** A pasta com tag a que o no pertence, ou `null`. */
  static taggedGroupOf(design, node) {
    if (!design || !node || !node.parentId) return null;
    const group = typeof design.getGroup === 'function' ? design.getGroup(node.parentId) : null;
    if (!group || !findGroupTag(group.tag)) return null;
    return group;
  }

  /**
   * A lista da tela com os embrulhos no lugar: cada item e um no solto
   * (`{ kind: 'node', node }`) ou uma pasta com tag (`{ kind: 'group',
   * group, members }`). O embrulho ocupa a posicao do membro mais ao
   * fundo -- a ordem da lista continua sendo o z, e o membro mais ao
   * fundo e quem ancora o conjunto na pilha.
   */
  static tree(design, contents) {
    const groupOf = new Map();
    const membersOf = new Map();
    contents.forEach((node) => {
      const group = DesignCodeRenderer.taggedGroupOf(design, node);
      if (!group) return;
      groupOf.set(node, group);
      if (!membersOf.has(group.id)) membersOf.set(group.id, []);
      membersOf.get(group.id).push(node);
    });

    const emitted = new Set();
    const items = [];
    contents.forEach((node) => {
      const group = groupOf.get(node);
      if (!group) {
        items.push({ kind: 'node', node });
        return;
      }
      if (emitted.has(group.id)) return;
      emitted.add(group.id);
      items.push({ kind: 'group', group, members: membersOf.get(group.id) });
    });
    return items;
  }

  /** Caixa alinhada aos eixos que envolve todos os membros. */
  static unionBounds(nodes) {
    return nodes.reduce((acc, node) => {
      const b = node.getBounds();
      return {
        left: Math.min(acc.left, b.left),
        top: Math.min(acc.top, b.top),
        right: Math.max(acc.right, b.right),
        bottom: Math.max(acc.bottom, b.bottom)
      };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  }

  /**
   * A "planta" da tela: os `steps` ja na ordem final do DOM, com o
   * numero (`nX`) que o HTML e o CSS vao usar de casamento. O embrulho
   * recebe o numero antes dos membros, entao `.n1` e o pai de `.n2`.
   *
   * Cada membro de um embrulho troca a origem: o `left`/`top` dele e
   * relativo a bbox da pasta (`member.origin`), e nao mais ao canto do
   * frame -- e o embrulho, esse sim, cai nas coordenadas do frame.
   */
  static plan(design, frame) {
    const contents = DesignCodeRenderer.contentsOf(design, frame);
    const items = DesignCodeRenderer.tree(design, contents);
    const origin = { x: frame.x, y: frame.y };
    const seq = { n: 0 };
    const steps = [];

    items.forEach((item) => {
      if (item.kind === 'group') {
        const index = ++seq.n;
        const box = DesignCodeRenderer.unionBounds(item.members);
        const memberOrigin = { x: box.left, y: box.top };
        const members = item.members.map((node) => ({ node, index: ++seq.n, origin: memberOrigin }));
        steps.push({ kind: 'group', group: item.group, index, box, origin, members });
      } else {
        steps.push({ kind: 'node', node: item.node, index: ++seq.n, origin });
      }
    });

    return { contents, steps, names: DesignCodeRenderer.imageNames(contents) };
  }

  /* ---- CSS ---- */

  /**
   * Uma regra por no, em vez de estilo embutido no elemento: o CSS e uma
   * das tres coisas que a pessoa vai ler e editar, e um arquivo so com
   * `<div style="...">` nao serve para isso. A classe do no (`n1`, `n2`)
   * e o vinculo com o HTML; o nome semantico (`type-text`, `shape-rect`)
   * e o que da para estilizar de novo.
   *
   * As coordenadas sao do DESIGN, nao do pai -- entao `origin` subtrai o
   * canto do frame: o que o canvas mostra dentro do frame muda de
   * lugar para a origem do `.screen`, senao o codigo sairia deslocado
   * quando o frame nao esta em (0,0).
   */
  static cssFor(node, index, origin) {
    const o = origin || {};
    const sel = '.n' + index;
    const box = [
      'position: absolute',
      'left: ' + px(node.x - (o.x || 0)),
      'top: ' + px(node.y - (o.y || 0)),
      'width: ' + px(node.width),
      'height: ' + px(node.height)
    ];

    // O SVG gira o grupo em torno do centro do no, e o CSS faz o mesmo
    // sem dizer de onde: o centro e o padrao.
    if (node.rotation) box.push('transform: rotate(' + px(node.rotation) + ')');

    if (node.type === 'frame') {
      box.push('background: ' + node.background);
      box.push('box-sizing: border-box');
    }

    if (node.type === 'shape') {
      if (node.shapeType === 'ellipse') {
        // `50%` em vez do raio em px: assim o no continua sendo uma
        // elipse quando a caixa e redimensionada.
        box.push('border-radius: 50%');
      } else if (node.shapeType === 'line') {
        // O desenho e um `<i>` dentro da caixa; a caixa em si fica vazia
        // para o giro e a medida baterem com o resto.
        box.push('pointer-events: none');
      } else if (node.shapeType === 'polygon') {
        // A tinta mora no `<svg>` do HTML, nao aqui: `clip-path` nao
        // desenharia o contorno, e um poligono sem contorno fala menos.
        box.push('display: block');
      } else {
        // Os quatro cantos sao a mesma ordem do CSS, o que faz o
        // `radii` do modelo virar uma regra e nao quatro.
        box.push('border-radius: ' + DesignCodeRenderer.radiusOf(node));
        box.push('background: ' + node.fill);
      }

      if (node.shapeType !== 'line' && node.shapeType !== 'polygon' && node.stroke !== 'none') {
        box.push('border: ' + px(node.strokeWidth) + ' solid ' + node.stroke);
        box.push('box-sizing: border-box');
      }
    }

    if (node.type === 'text') {
      box.push('font-family: ' + node.fontFamily);
      box.push('font-size: ' + px(node.fontSize));
      box.push('font-weight: ' + node.fontWeight);
      box.push('color: ' + node.color);
      box.push('text-align: ' + node.align);
      box.push('line-height: ' + node.lineHeight);
      // `pre` para os `\n` digitados virarem quebra de linha como no SVG;
      // `break-word` para a palavra mais larga que a caixa tambem quebrar.
      box.push('white-space: pre-wrap');
      box.push('overflow-wrap: break-word');
      box.push('box-sizing: border-box');
    }

    if (node.type === 'image') {
      box.push('object-fit: ' + DesignCodeRenderer.objectFitOf(node));
      box.push('display: block');
    }

    // No invisivel: o elemento continua no codigo, com `display: none`.
    // Ele esta dentro do frame, entao pertence a tela; so nao aparece,
    // como nao aparece no canvas. E a ultima regra da lista de propriedades
    // de proposito: `display: none` tem de vencer o `display: block` da
    // imagem acima.
    if (node.visible === false) box.push('display: none');

    return sel + ' {\n  ' + box.join(';\n  ') + ';\n}';
  }

  static radiusOf(node) {
    const radii = Array.isArray(node.radii) ? node.radii : [0, 0, 0, 0];
    // A ordem do CSS e a mesma do SVG: superior esquerdo, superior
    // direito, inferior direito, inferior esquerdo.
    return radii.map(px).join(' ');
  }

  /** O `fit` da imagem e o `object-fit` do CSS, com os mesmos nomes. */
  static objectFitOf(node) {
    if (node.fit === 'slice') return 'cover';
    if (node.fit === 'none') return 'fill';
    return 'contain';
  }

  /** O tracado da linha: caixa vazia do tamanho do no + um `<i>` na diagonal. */
  static lineCss(node, index) {
    const length = Math.hypot(node.width, node.height);
    const angle = Math.atan2(node.height, node.width) * 180 / Math.PI;
    const stroke = node.stroke === 'none' ? node.fill : node.stroke;
    const w = Math.max(1, node.strokeWidth);
    return [
      '.n' + index + ' > i {',
      '  position: absolute;',
      '  left: 50%;',
      '  top: 50%;',
      '  width: ' + px(length) + ';',
      '  height: ' + px(w) + ';',
      '  margin-top: ' + px(-w / 2) + ';',
      // `translate(-50%)` em X recentra o comprimento pela metade; o
      // `rotate` gira em torno do centro, como o `<line>` do SVG.
      '  transform: translateX(-50%) rotate(' + (Math.round(angle * 100) / 100) + 'deg);',
      '  background: ' + stroke + ';',
      '  border-radius: ' + px(w / 2) + ';',
      '}'
    ].join('\n');
  }

  static baseCss(frame) {
    // O `.screen` e o proprio frame: o fundo dele (o `background` do
    // model) tem de vir aqui, porque o frame em questao nao entra em
    // `contentsOf` -- ele e a tela, nao um elemento dentro dela.
    //
    // A pagina e o frame, e mais nada: sem padding, sem cor de fundo e
    // sem sombra de artboard, que sao moldura da aplicacao e nao do que
    // foi desenhado. `overflow: hidden` e o que cumpre a promessa do
    // arquivo -- so o que esta dentro do frame -- recortando o no que
    // cruza a borda. O `clipContent` do model nao e consultado aqui:
    // desligado, ele deixaria vazar para fora justamente o que o
    // arquivo promete nao conter.
    return [
      'body {',
      '  margin: 0;',
      '}',
      '.screen {',
      '  position: relative;',
      '  width: ' + px(frame.width) + ';',
      '  height: ' + px(frame.height) + ';',
      '  background: ' + frame.background + ';',
      '  overflow: hidden;',
      '}'
    ].join('\n');
  }

  /** A regra de um no solto: o `cssFor` e, na linha, o `<i>` do tracejado. */
  static cssForNode(node, index, origin) {
    const base = DesignCodeRenderer.cssFor(node, index, origin);
    return node.type === 'shape' && node.shapeType === 'line'
      ? base + '\n' + DesignCodeRenderer.lineCss(node, index)
      : base;
  }

  /**
   * A regra do embrulho da pasta: uma caixa absoluta na bbox dos
   * membros, mais o reset da tag (`GroupTagCatalog`). O reset vem
   * DEPOIS da caixa de proposito -- um `appearance`/`border`/`padding`
   * da tag ideal tem de poder vencer o que a caixa ja pos.
   */
  static cssForGroup(entry) {
    const meta = findGroupTag(entry.group.tag);
    const o = entry.origin || {};
    const box = [
      'position: absolute',
      'left: ' + px(entry.box.left - (o.x || 0)),
      'top: ' + px(entry.box.top - (o.y || 0)),
      'width: ' + px(entry.box.right - entry.box.left),
      'height: ' + px(entry.box.bottom - entry.box.top)
    ];
    (meta.css || []).forEach((prop) => box.push(prop));
    return '.n' + entry.index + ' {\n  ' + box.join(';\n  ') + ';\n}';
  }

  /* ---- HTML ---- */
  /**
   * Imagens: o caminho que o codigo referencia, e nao o arquivo.

   * O `src` do modelo e um data URL -- um arquivo inteiro embutido no
   * HTML. numa tela de varias imagens isso vira uma parede de base64
   * ilegivel, que nao da para versionar nem editar. O modelo continua
   * guardando o data URL (`UIImage.js` ja explica por que: o
   * `.uidesign.json` tem de valer sozinho); quem sai daqui leva
   * `imagens/imagem-N.ext` no lugar, com os bytes indo no pacote do
   * download.
   */
  static isDataUrl(src) {
    return typeof src === 'string' && src.slice(0, 5) === 'data:';
  }

  /** A extensao vem do MIME do proprio data URL: `image/png` -> `png`. */
  static imageExt(src) {
    const pos = src.indexOf(',');
    const header = src.slice(5, pos === -1 ? src.length : pos);
    const mime = header.split(';')[0].toLowerCase();
    const sub = mime.split('/')[1] || '';
    // Só o que e extensao de verdade: `jpeg` e o unico subtype comum que
    // se escreve de outro jeito no disco; o resto de um MIME estranho
    // (`image/x-qualquer-coisa`) vira `img`, que pelo menos abre.
    if (sub === 'jpeg') return 'jpg';
    const known = ['png', 'jpg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif'];
    return known.indexOf(sub) !== -1 ? sub : 'img';
  }

  /**
   * Um nome por imagem, gerado da posicao dela na tela:
   * `imagens/imagem-1.png`, `imagens/imagem-2.png`...
   *
   * A mesma data URL em dois nos vira UM arquivo so -- a regra e por
   * conteudo, nao por no, senao a pasta de imagens sairia duplicada. URLs
   * que nao sao data URL ficam de fora: elas ja sao uma referencia e
   * viajam no codigo do jeito que estao.
   */
  static imageNames(contents) {
    const names = new Map();
    let ordem = 0;
    contents.forEach((node) => {
      if (node.type !== 'image' || !DesignCodeRenderer.isDataUrl(node.src)) return;
      if (names.has(node.src)) return;
      ordem += 1;
      names.set(node.src, 'imagens/imagem-' + ordem + '.' + DesignCodeRenderer.imageExt(node.src));
    });
    return names;
  }

  /** Os bytes de um data URL, para o ZIP -- `null` se nao der para ler. */
  static dataUrlBytes(src) {
    try {
      const pos = src.indexOf(',');
      const header = src.slice(5, pos === -1 ? src.length : pos);
      const payload = pos === -1 ? '' : src.slice(pos + 1);
      if (!header.endsWith(';base64')) return new TextEncoder().decode(payload);
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch (e) {
      return null;
    }
  }

  /**
   * O pacote de imagens do download: os MESMOS nomes que o HTML
   * referencia, com os bytes tirados do data URL do modelo. Deduplicado
   * por conteudo, igual `imageNames` -- sao as duas faces da mesma lista.
   *
   * @param {Array} contents - os nos da tela
   * @returns {Array<{nome:string, dados:Uint8Array}>} pronto para o ZipStore
   */
  static screenImagens(contents) {
    const names = DesignCodeRenderer.imageNames(contents);
    const arquivos = [];
    const usados = new Set();
    contents.forEach((node) => {
      if (node.type !== 'image' || !DesignCodeRenderer.isDataUrl(node.src)) return;
      if (usados.has(node.src)) return;
      usados.add(node.src);
      const dados = DesignCodeRenderer.dataUrlBytes(node.src);
      if (!dados) return;
      const path = names.get(node.src);
      if (path) arquivos.push({ nome: path.slice(path.indexOf('/') + 1), dados });
    });
    return arquivos;
  }

  static htmlFor(node, index, names) {
    const cls = 'n' + index + ' ' + DesignCodeRenderer.semanticClass(node);
    // O `id` e o mesmo `nX` das classes: e a ancora de quem for escrever
    // JavaScript proprio na aba Codigo (`document.getElementById` ja o
    // acha), e o que os nos de fora do frame nunca teriam.
    const id = 'n' + index;
    if (node.type === 'text') {
      return '<div class="' + cls + '" id="' + id + '">' + esc(node.text) + '</div>';
    }
    if (node.type === 'image') {
      // O caminho vem de `imageNames` (o mesmo mapa que alimenta o ZIP);
      // fora dele -- `src` que ja era URL, ou chamada avulsa -- o valor
      // viaja como esta.
      const src = (names && names.get(node.src)) || node.src;
      // `alt` vazio e o correto: a imagem e decorativa aqui, e um `alt`
      // inventado seria lido em voz alta por um leitor de tela.
      return '<img class="' + cls + '" id="' + id + '" src="' + esc(src) + '" alt="">';
    }
    if (node.type === 'shape' && node.shapeType === 'line') {
      return '<div class="' + cls + '" id="' + id + '"><i></i></div>';
    }
    if (node.type === 'shape' && node.shapeType === 'polygon') {
      return DesignCodeRenderer.polygonHtml(node, cls, id);
    }
    return '<div class="' + cls + '" id="' + id + '"></div>';
  }

  /**
   * O poligono vira um SVG embutido no lugar do `<div>`: so assim o
   * contorno acompanha as arestas (CSS nao tem como desenhar um poligono
   * com contorno), e o `viewBox` da caixa do no faz o CSS continuar
   * mandando na posicao/tamanho pelo `.nX`.
   */
  static polygonHtml(node, cls, id) {
    const pts = (node.points || []).map((p) => DesignCodeRenderer.coord(p.x) + ',' + DesignCodeRenderer.coord(p.y)).join(' ');
    const paint = 'fill="' + esc(node.fill) + '"';
    const stroke = node.stroke !== 'none'
      ? ' stroke="' + esc(node.stroke) + '" stroke-width="' + DesignCodeRenderer.coord(node.strokeWidth) + '" stroke-linejoin="round"'
      : '';
    return '<svg class="' + cls + '" id="' + id + '" viewBox="0 0 '
      + DesignCodeRenderer.coord(node.width) + ' ' + DesignCodeRenderer.coord(node.height) + '">'
      + '<polygon points="' + pts + '" ' + paint + stroke + '/></svg>';
  }

  /** Numero puro (sem `px`), para coordenadas dentro do SVG. */
  static coord(value) {
    return String(Math.round(Number(value) * 100) / 100);
  }

  static semanticClass(node) {
    if (node.type === 'shape') return 'type-shape shape-' + node.shapeType;
    return 'type-' + node.type;
  }

  /** Classe do embrulho: `type-group` mais a tag, para dar para estilizar. */
  static groupClass(group) {
    return 'type-group tag-' + group.tag;
  }

  /**
   * O embrulho de uma pasta com tag. Elemento que aceita filhos sai com
   * os membros dentro, cada um indentado um nivel. Elemento vazio
   * (`input`) nao tem onde por filho: o texto do primeiro membro de
   * texto vira `placeholder` e o resto dos membros nao entra no HTML --
   * e a unica leitura possivel de um `<input>` desenhado com um texto
   * dentro dele.
   */
  static groupHtml(entry, names) {
    const meta = findGroupTag(entry.group.tag);
    const cls = 'n' + entry.index + ' ' + DesignCodeRenderer.groupClass(entry.group);
    const id = 'n' + entry.index;

    if (meta.void) {
      let placeholder = '';
      if (meta.placeholderFromText) {
        const text = entry.members.map((m) => m.node).find((node) => node.type === 'text' && node.text);
        if (text) placeholder = ' placeholder="' + esc(text.text) + '"';
      }
      return '<input class="' + cls + '" id="' + id + '"' + placeholder + '>';
    }

    const attrs = (meta.attrs || []).map((pair) => ' ' + pair[0] + '="' + esc(pair[1]) + '"').join('');
    const inner = entry.members
      .map((m) => '  ' + DesignCodeRenderer.htmlFor(m.node, m.index, names))
      .join('\n');
    return '<' + meta.tag + ' class="' + cls + '" id="' + id + '"' + attrs + '>\n'
      + inner + '\n</' + meta.tag + '>';
  }

  /**
   * A tela e so o frame e o que esta dentro dele: nada de botoes de
   * visibilidade nem de roupa da aplicacao por cima -- o arquivo baixado
   * tem de ser o desenho, e mais nada.
   *
   * `steps` e a lista da `plan`: nos soltos e embrulhos de pasta ja na
   * ordem final, com o `nX` de cada um.
   */
  static html(steps, names) {
    const mapa = names || new Map();
    const parts = ['<div class="screen" id="screen">'];
    steps.forEach((step) => {
      const markup = step.kind === 'group'
        ? DesignCodeRenderer.groupHtml(step, mapa)
        : DesignCodeRenderer.htmlFor(step.node, step.index, mapa);
      parts.push(indent(markup, 2));
    });
    parts.push('</div>');
    return parts.join('\n');
  }

  /* ---- A pagina inteira ---- */

  /**
   * O JavaScript vem vazio de proposito: o modulo nao inventa
   * interacao que o design nao tem. A caixa da aba Codigo e onde a
   * pessoa escreve a dela, e so o que estiver escrito la vai para o
   * arquivo.
   *
   * @param {object} design - o documento (para resolver as pastas com tag)
   * @param {object} frame - o frame que virou tela
   * @returns {{title: string, html: string, css: string, js: string}}
   */
  static screenFor(design, frame) {
    const plan = DesignCodeRenderer.plan(design, frame);
    const rules = [];
    plan.steps.forEach((step) => {
      if (step.kind === 'group') {
        rules.push(DesignCodeRenderer.cssForGroup(step));
        step.members.forEach((m) => rules.push(DesignCodeRenderer.cssForNode(m.node, m.index, m.origin)));
      } else {
        rules.push(DesignCodeRenderer.cssForNode(step.node, step.index, step.origin));
      }
    });

    const parts = [DesignCodeRenderer.baseCss(frame)];
    if (rules.length) parts.push(rules.join('\n\n'));
    const css = parts.join('\n\n');

    return {
      title: frame.name,
      html: DesignCodeRenderer.html(plan.steps, plan.names),
      css,
      js: ''
    };
  }

  /** O arquivo que o botao de baixar entrega: um so, com style e script dentro. */
  static document(screen) {
    const js = String(screen.js || '').trim();
    const parts = [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + esc(screen.title) + '</title>',
      '<style>',
      screen.css,
      '</style>',
      '</head>',
      '<body>',
      screen.html
    ];
    // Sem JavaScript escrito nao ha porque emitir um `<script>` vazio:
    // ele so acrescentaria uma linha em branco ao arquivo.
    if (js) parts.push('<script>', screen.js, '</script>');
    parts.push('</body>', '</html>', '');
    return parts.join('\n');
  }

  /** Caminho curto: frame -> conteudo -> tela. */
  static forFrame(design, frame) {
    if (!frame || frame.type !== 'frame') return null;
    return DesignCodeRenderer.screenFor(design, frame);
  }
}
