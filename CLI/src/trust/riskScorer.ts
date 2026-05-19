export type RiskLevel = 'low' | 'medium' | 'high';
export type ShellRisk = 'block' | 'confirm' | 'allow';

const HIGH_RISK_PATTERNS =[
    /\.env/,
    /\.env\.\w+/,
    /docker-compose/,
    /\.git\//,
];


const BLOCKED_SHELL_PATTERNS = [
    /\brm\s+-rf?\s+\/(?!\w)/,            // rm -rf / (not /something)
    /\brm\s+-rf?\s+~(?!\w)/,             // rm -rf ~
    /\bsudo\b/,
    /\|\s*(sh|bash|zsh)\b/,              // piped to a shell — curl | sh etc.
    /:\s*\(\s*\)\s*\{.*\|.*&\s*\}\s*;\s*:/, // fork bomb
    /\bdd\s+if=/,                         // dd block-level copy
    />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme)/,  // writing to disk devices
    /\bmkfs\b/,                           // formatting disks
    /\bchmod\s+-R\s+777\s+\//,            // chmod 777 root
];


const CONFIRM_SHELL_PATTERNS = [
    /\bgit\s+push\b/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+rebase\b/,
    /\bgit\s+(force-?push|push\s+-f)\b/,
    /\bnpm\s+(publish|install|i|uninstall|un|rm|remove)\b/,
    /\byarn\s+(add|remove|publish)\b/,
    /\bpnpm\s+(add|remove|publish)\b/,
    /\bdocker\s+(rm|rmi|kill|exec)\b/,
];





const LOW_RISK_TOOLS =  ['listFiles', 'readFile', 'searchCode'];

export function scoreRisk(toolName: string, args?: Record<string,any>):RiskLevel{
    if(LOW_RISK_TOOLS.includes(toolName)) return 'low';
    const filePath = args?.filePath ?? args?.path ?? '';
    if(HIGH_RISK_PATTERNS.some(p=>p.test(filePath))) return 'high'
    return 'medium';
}

export function getRiskMessage(toolName: string,riskLevel:RiskLevel,args?:Record<string,any>): string {
    const filePath = args?.filePath ?? '';
    if (riskLevel === 'high') return `Blocked: writing to ${filePath} is not allowed.`;
    if (riskLevel === 'medium') return `${toolName}${filePath ? ` -> ${filePath}` : ''}`;
    return '';
}


export function scoreShellRisk(command: string): ShellRisk {
    const trimmed = command.trim();
    if (BLOCKED_SHELL_PATTERNS.some(p => p.test(trimmed))) return 'block';
    if (CONFIRM_SHELL_PATTERNS.some(p => p.test(trimmed))) return 'confirm';
    return 'allow';
}

