class ImageObject extends BoardObject {
    constructor(id, x, y, src, width, height) {
        super(id, x, y, width || 200, height || 150);
        this.type = 'image';
        this.src = src || '';
    }

    setSrc(src) {
        this.src = src;
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
            type: 'image',
            src: this.src
        };
    }

    static fromJSON(data) {
        return new ImageObject(data.id, data.x, data.y, data.src, data.width, data.height);
    }
}
