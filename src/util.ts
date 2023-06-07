export const logger = (name: string) => {
    return console.log.bind(
        window.console,
        `%c Discord Status %c ${name} %c`,
        'background: #7289da; color: black;',
        'background: #5865F2; color: black;',
        'background: transparent;'
    );
};
