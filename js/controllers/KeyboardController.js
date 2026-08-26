class KeyboardController {
    constructor(board) {
        this.board = board;
        this.listeners = [];
        this._enabled = true;
    }

    init() {
        document.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    setEnabled(enabled) {
        this._enabled = enabled;
    }

    _onKeyDown(e) {
        if (!this._enabled) return;

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
            return;
        }

        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                this._emit('deleteSelected');
                break;
            case 'Escape':
                this._emit('escape');
                break;
            case 'v':
            case 'V':
                this._emit('toolChange', 'select');
                break;
            case 'e':
            case 'E':
                this._emit('toolChange', 'math');
                break;
            case 't':
            case 'T':
                this._emit('toolChange', 'text');
                break;
            case 'i':
            case 'I':
                this._emit('toolChange', 'image');
                break;
        }
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
