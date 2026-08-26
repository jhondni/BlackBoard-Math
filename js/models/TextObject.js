class TextObject extends BoardObject {
    constructor(id, x, y, text) {
        super(id, x, y, 0, 0);
        this.type = 'text';
        this.text = text || '';
    }

    setText(text) {
        this.text = text;
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
            type: 'text',
            text: this.text
        };
    }

    static fromJSON(data) {
        return new TextObject(data.id, data.x, data.y, data.text);
    }
}
