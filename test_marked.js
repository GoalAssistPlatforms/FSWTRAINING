import { marked } from 'marked';
const markdown = '```mermaid\ngraph TD;\nA-->B;\n```';
console.log(JSON.stringify(marked.parse(markdown)));
