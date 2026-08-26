class MathObject extends BoardObject {
    constructor(id, x, y, latex) {
        super(id, x, y, 0, 0);
        this.type = 'math';
        this.latex = latex || '';
    }

    setLatex(latex) {
        this.latex = latex;
    }

    updateDimensions() {
        if (this.element) {
            this.width = this.element.offsetWidth;
            this.height = this.element.offsetHeight;
        }
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'math',
            latex: this.latex
        };
    }

    static fromJSON(data) {
        return new MathObject(data.id, data.x, data.y, data.latex);
    }
}
