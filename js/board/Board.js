class Board {
    constructor(boardElement) {
        this.element = boardElement;
        this.objects = [];
        this.selectedObject = null;
        this.listeners = [];
    }

    addObject(object) {
        this.objects.push(object);
        return object;
    }

    removeObject(id) {
        const obj = this.getObject(id);
        if (obj) {
            obj.destroy();
            this.objects = this.objects.filter(o => o.id !== id);
            if (this.selectedObject && this.selectedObject.id === id) {
                this.selectedObject = null;
            }
        }
    }

    getObject(id) {
        return this.objects.find(o => o.id === id) || null;
    }

    getObjectAtPoint(x, y) {
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const obj = this.objects[i];
            if (obj.containsPoint(x, y)) {
                return obj;
            }
        }
        return null;
    }

    selectObject(object) {
        if (this.selectedObject) {
            this.selectedObject.deselect();
        }
        this.selectedObject = object;
        if (object) {
            object.select();
        }
        this._emit('selectionChanged', object);
    }

    deselectAll() {
        if (this.selectedObject) {
            this.selectedObject.deselect();
            this.selectedObject = null;
            this._emit('selectionChanged', null);
        }
    }

    bringToFront(object) {
        const idx = this.objects.indexOf(object);
        if (idx > -1) {
            this.objects.splice(idx, 1);
            this.objects.push(object);
            if (object.element) {
                this.element.appendChild(object.element);
            }
        }
    }

    sendToBack(object) {
        const idx = this.objects.indexOf(object);
        if (idx > -1) {
            this.objects.splice(idx, 1);
            this.objects.unshift(object);
            if (object.element) {
                this.element.prepend(object.element);
            }
        }
    }

    clear() {
        this.objects.forEach(obj => obj.destroy());
        this.objects = [];
        this.selectedObject = null;
    }

    getBoardRect() {
        return this.element.getBoundingClientRect();
    }

    getScrollOffset() {
        return {
            x: this.element.scrollLeft,
            y: this.element.scrollTop
        };
    }

    toJSON() {
        return this.objects.map(obj => obj.toJSON());
    }

    fromJSON(dataArray) {
        const typeMap = {
            math: MathObject,
            text: TextObject,
            image: ImageObject
        };

        dataArray.forEach(data => {
            const Cls = typeMap[data.type];
            if (Cls) {
                const obj = Cls.fromJSON(data);
                this.addObject(obj);
            }
        });

        return this.objects;
    }

    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    _emit(event, data) {
        this.listeners
            .filter(l => l.event === event)
            .forEach(l => l.callback(data));
    }
}
