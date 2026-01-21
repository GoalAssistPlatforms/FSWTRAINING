import { marked } from 'marked';

const renderer = {
    code(token) {
        console.log('Arg type:', typeof token);
        console.log('Arg keys:', Object.keys(token || {}));
        return 'CODE_BLOCK_INTERCEPTED';
    }
};

marked.use({ renderer });
const markdown = '```mermaid\ngraph TD;\n```';
console.log(marked.parse(markdown));
