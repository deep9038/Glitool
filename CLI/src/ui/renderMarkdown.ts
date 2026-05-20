import chalk, { type ChalkInstance } from 'chalk';

const SEVERITY: Record<string, ChalkInstance> = {
    CRITICAL:   chalk.hex('#b54226').bold,   // rust — danger
    WARNING:    chalk.hex('#c69a3a').bold,   // mustard — caution
    SUGGESTION: chalk.hex('#6c5ab8').bold,   // violet — info
    GOOD:       chalk.hex('#5a8c5a').bold,   // sage — success
    SUMMARY:    chalk.hex('#c4732e').bold,   // amber — neutral header
    ERROR:      chalk.hex('#b54226').bold,   // rust
    NOTE:       chalk.hex('#c69a3a').bold,   // mustard
    INFO:       chalk.hex('#3e8a9a').bold,   // teal
};

export function renderMarkdown(text: string): string {
    return text
        // fenced code blocks ```...```
        .replace(/```(?:\w+)?\n([\s\S]+?)```/gm, (_, code) =>
            chalk.hex('#3e8a9a')(code.trimEnd()))
        // ## H1/H2 → amber bold uppercase + padding
        .replace(/^#{1,2} (.+)$/gm, (_, t) =>
            '\n' + chalk.hex('#c4732e').bold(t.trim().toUpperCase()) + '\n')
        // ### H3 → amber normal
        .replace(/^### (.+)$/gm, (_, t) =>
            chalk.hex('#c4732e')(t.trim()))
        // **bold** → bold white
        .replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold.white(t))
        // *italic* → muted italic
        .replace(/\*([^*\n]+)\*/g, (_, t) => chalk.italic.hex('#8a8170')(t))
        // `inline code` → teal
        .replace(/`([^`\n]+)`/g, (_, t) => chalk.hex('#3e8a9a')(t))
        // severity keywords on their own line (CRITICAL, WARNING etc)
        .replace(/^(CRITICAL|WARNING|SUGGESTION|GOOD|SUMMARY|ERROR|NOTE|INFO)$/gm,
            (_, kw) => (SEVERITY[kw] ?? chalk.bold)(kw))
        // severity keywords inline
        .replace(/\b(CRITICAL|WARNING|SUGGESTION|GOOD|ERROR|NOTE|INFO)\b/g,
            (_, kw) => (SEVERITY[kw] ?? chalk.bold)(kw))
        // file:line references → muted2 (readable but not distracting)
        .replace(/\b([\w./\\-]+\.(ts|tsx|js|jsx|py|go|rs|json|md)):(\d+)(-\d+)?\b/g,
            (m) => chalk.hex('#b3a994')(m))
        // --- horizontal rule → dim line
        .replace(/^---+$/gm, chalk.hex('#8a8170')('─'.repeat(50)))
        // numbered list → mustard number
        .replace(/^(\d+)\. (.+)$/gm, (_, n, t) =>
            `  ${chalk.hex('#c69a3a').bold(n + '.')} ${t}`)
        // - bullet → amber arrow
        .replace(/^[-*] (.+)$/gm, (_, t) =>
            `  ${chalk.hex('#c4732e')('→')} ${t}`)
        // _none_ → dimmed
        .replace(/^_([^_\n]+)_$/gm, (_, t) => chalk.dim(t))
        .trimEnd();
}
