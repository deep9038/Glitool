export type StageKind = 'planner' | 'coder' | 'validator' | 'judge'
    | 'debugger' | 'reviewer' | 'refactorer' | 'git_agent';

export type ProcessEvent =
    | { type: 'stage_start'; stage: StageKind }
    | { type: 'reasoning';   stage: StageKind; text: string }
    | { type: 'tool';        stage: StageKind; tool: string; target: string }
    | { type: 'stage_done';  stage: StageKind };