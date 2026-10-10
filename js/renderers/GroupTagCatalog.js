/* ============================================
   UI/UX DESIGNER - GroupTagCatalog
   ============================================
   Catalogo das tags que uma pasta do painel de
   camadas pode assumir no codigo gerado.

   Uma pasta sem tag continua sendo so organizacao
   do painel: nao entra no HTML (o comportamento de
   sempre). Quando a pasta recebe uma destas tags, o
   renderer embrulha os membros num elemento real
   dessa tag -- `<button>`, `<a>`, `<input>`... -- em
   vez do `<div>` generico.

   "Tag ideal" e o reset que cada elemento traz do
   navegador e que atrapalharia o desenho: um
   `<button>` nasce com borda e fundo cinza, um `<a>`
   com sublinhado e azul, um `<input>` com borda,
   padding e foco. O `css` de cada entrada e a lista
   de propriedades que apaga esse visual nativo para
   o elemento ser so a caixa desenhada, com a
   posicao/tamanho ja mandados pelo `.nX` do CSS.

   Campos de uma entrada:
     tag    - o nome do elemento
     label  - o rotulo do `<select>` do painel
     css    - propriedades do reset (sem chaves)
     attrs  - atributos fixos do elemento (ex.: href)
     void   - o elemento nao aceita filhos (input);
              nesse caso o texto do membro vira
              `placeholder` em vez de virar filho
     placeholderFromText - o texto do primeiro
              membro de texto preenche o placeholder
   ============================================ */

export const GROUP_TAGS = [
  { tag: 'div', label: 'div - contêiner', css: [] },
  {
    tag: 'button',
    label: 'button - botão',
    css: [
      'appearance: none',
      '-webkit-appearance: none',
      'padding: 0',
      'border: none',
      'background: none',
      'font: inherit',
      'color: inherit',
      'text-align: inherit',
      'cursor: pointer'
    ]
  },
  {
    tag: 'a',
    label: 'a - link',
    attrs: [['href', '#']],
    css: ['display: block', 'text-decoration: none', 'color: inherit', 'cursor: pointer']
  },
  {
    tag: 'input',
    label: 'input - campo',
    void: true,
    placeholderFromText: true,
    css: [
      'appearance: none',
      '-webkit-appearance: none',
      'margin: 0',
      'padding: 0',
      'border: none',
      'background: none',
      'font: inherit',
      'color: inherit',
      'box-sizing: border-box',
      'outline: none'
    ]
  },
  {
    tag: 'label',
    label: 'label - rótulo',
    css: ['display: block', 'cursor: pointer']
  },
  { tag: 'form', label: 'form - formulário', css: ['margin: 0', 'padding: 0'] },
  { tag: 'nav', label: 'nav - navegação', css: ['display: block'] },
  { tag: 'header', label: 'header - cabeçalho', css: ['display: block'] },
  { tag: 'footer', label: 'footer - rodapé', css: ['display: block'] },
  { tag: 'main', label: 'main - principal', css: ['display: block'] },
  { tag: 'section', label: 'section - seção', css: ['display: block'] },
  { tag: 'article', label: 'article - artigo', css: ['display: block'] },
  { tag: 'aside', label: 'aside - lateral', css: ['display: block'] }
];

/** A entrada da tag, com o nome normalizado, ou `null` se nao existe. */
export function findGroupTag(tag) {
  const name = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
  return GROUP_TAGS.find((entry) => entry.tag === name) || null;
}
