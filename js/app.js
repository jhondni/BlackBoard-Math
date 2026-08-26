document.addEventListener('DOMContentLoaded', () => {
    const boardElement = document.getElementById('board');
    const board = new Board(boardElement);

    const mouseController = new MouseController(board, boardElement);
    const keyboardController = new KeyboardController(board);
    const controller = new BoardController(board, mouseController, keyboardController);

    controller.init();

    document.getElementById('btn-save').addEventListener('click', () => {
        const data = board.toJSON();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lousa-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('btn-load').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    board.clear();
                    const objects = board.fromJSON(data);
                    objects.forEach(obj => {
                        switch (obj.type) {
                            case 'math':
                                controller.mathRenderer.render(obj, boardElement);
                                break;
                            case 'text':
                                controller.textRenderer.render(obj, boardElement);
                                break;
                            case 'image':
                                controller.svgRenderer.render(obj, boardElement);
                                break;
                        }
                    });
                } catch (err) {
                    console.error('Erro ao carregar arquivo:', err);
                    alert('Arquivo inválido.');
                }
            };
            reader.readAsText(file);
        });
        input.click();
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar toda a lousa?')) {
            board.clear();
        }
    });

    window.lousa = { board, controller };
});
