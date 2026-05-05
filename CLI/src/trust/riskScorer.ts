export type RiskLevel = 'low' | 'medium' | 'high';


const HIGH_RISK_PATTERNS =[
    /\.env/,
    /\.env\.\w+/,
    /package\.json$/,
    /tsconfig\.json$/,
    /docker-compose/,
    /\.git\//,
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


