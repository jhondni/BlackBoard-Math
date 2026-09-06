# UML de Classes

## Diagrama Mermaid

```mermaid
classDiagram
    class BoardObject {
        <<abstract>>
        -id: String
        -x: Number
        -y: Number
        -width: Number
        -height: Number
        -rotation: Number
        -selected: Boolean
        +move(x, y): void
        +resize(w, h): void
        +rotate(angle): void
        +select(): void
        +deselect(): void
        +applyBlur(on): void
        +sync(): void
        +render(): BoardObject
        +toJSON(): Object
    }

    class MathObject {
        -latex: String
        -fontSize: Number
        +setLatex(latex): void
        +reRender(): void
    }

    class TextObject {
        -text: String
        -fontSize: Number
        +setText(text): void
        +toDOMContent(el): void
    }

    class ImageObject {
        -src: String
        -isGraph: Boolean
        +setSrc(src): void
        +toDOMContent(el): void
    }

    class ShapeObject {
        -shapeType: String
        -fill: String
        -stroke: String
        +toDOMContent(el): void
    }

    class Board {
        -objects: BoardObject[]
        -selectedObject: BoardObject
        -zoom: Number
        -offsetX: Number
        -offsetY: Number
        -pages: Object[]
        -library: Object[]
        -history: Object[]
        +addObject(obj): BoardObject
        +removeObject(obj): Boolean
        +getObject(id): BoardObject
        +selectObject(obj): BoardObject
        +deselectObject(): void
        +clear(): void
        +createMath(latex, x, y): MathObject
        +createText(x, y): TextObject
        +createImage(src, x, y, isGraph): ImageObject
        +createShape(type, x, y, opts): ShapeObject
        +pushHistory(): void
    }

    BoardObject <|-- MathObject
    BoardObject <|-- TextObject
    BoardObject <|-- ImageObject
    BoardObject <|-- ShapeObject
    Board "1" o-- "many" BoardObject

    MathObject ..> MathRenderer : uses
    TextObject ..> TextRenderer : uses
    ShapeObject ..> SVGRenderer : uses

    class MathRenderer {
        +render(latex, el, opts): HTMLElement
        +toSVG(latex): SVGElement
    }
    MathRenderer ..> KaTeX
    MathRenderer ..> MathJax
```

## Diagrama ASCII

```
┌──────────────────────────────────────┐
│             <<abstract>>             │
│              BoardObject             │
├──────────────────────────────────────┤
│ - id: String                         │
│ - x: Number                          │
│ - y: Number                          │
│ - width: Number                      │
│ - height: Number                     │
│ - rotation: Number                   │
│ - selected: Boolean                  │
├──────────────────────────────────────┤
│ + move(x, y): void                   │
│ + resize(w, h): void                 │
│ + rotate(angle): void                │
│ + select(): void                     │
│ + deselect(): void                   │
│ + applyBlur(on): void                │
│ + sync(): void                       │
│ + render(): BoardObject              │
│ + toJSON(): Object                   │
└─────────────────┬────────────────────┘
                  │
          herança │
     ┌────────────┼─────────────┬──────────────┐
     │            │             │              │
     ▼            ▼             ▼              ▼
┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐
│MathObject│ │TextObject│ │ImageObject │ │ShapeObject │
├──────────┤ ├──────────┤ ├────────────┤ ├────────────┤
│- latex   │ │- text    │ │- src       │ │- shapeType │
│- fontSize│ │- fontSize│ │- isGraph   │ │- fill      │
└────┬─────┘ └──────────┘ └────────────┘ │- stroke    │
     │                                   └────────────┘
     │
     ▼
┌──────────────────┐
│  MathRenderer    │
├──────────────────┤
│ + render()       │
│ + toSVG()        │
└────────┬─────────┘
         │
     ┌───┴────┐
     ▼        ▼
┌────────┐ ┌─────────┐
│ KaTeX  │ │ MathJax │
└────────┘ └─────────┘

┌──────────────────────────────────────┐
│                Board                 │
├──────────────────────────────────────┤
│ - objects: BoardObject[]             │
│ - selectedObject: BoardObject        │
│ - zoom: Number                       │
│ - offsetX: Number                    │
│ - offsetY: Number                    │
│ - pages: Object[]                    │
│ - library: Object[]                  │
│ - history: Object[]                  │
├──────────────────────────────────────┤
│ + addObject() / removeObject()       │
│ + getObject() / selectObject()       │
│ + deselectObject() / clear()         │
│ + createMath/Text/Image/Shape()      │
│ + pushHistory()                      │
└──────────────────┬───────────────────┘
                   │
                   │ contém 1..*
                   ▼
            BoardObject[]
```

## Views e Controllers (Complementares)

As views e controllers **não herdam** do modelo; eles o consomem.

```
User → ToolbarView → ToolController ──▶ Board (Model)
User → Canvas ----> MouseController ──▶ Board (desenho/blur)
User → Modais ----> MathEditorView ──▶ ObjectController ──▶ Board
User → Lousa ------> BoardView + SelectionView ──▶ Board.objects
       ↑
       └── renderizado a partir do Board
```

## Ciclo de vida de um objeto

```
ObjectController.createEquation(latex, x, y)
   → Board.createMath(...)            # cria o modelo
   → BoardView.addObjectElement(obj)  # cria o DOM
   → ObjectController.onCommit()      # salva histórico
```

```
SelectionView (drag/resize)
   → obj.move()/obj.resize()          # atualiza o modelo (getters/setters sync)
   → onCommitChange()                 # salva histórico
```
