export type StageKind = 'coding' | 'debugging' | 'refactoring' | 'git' | 'planning' | 'review'

export type ProcessEvent =
    | { type: 'stage_start'; stage: StageKind }
    | { type: 'reasoning';   stage: StageKind; text: string }
    | { type: 'tool';        stage: StageKind; tool: string; target: string }
    | { type: 'stage_done';  stage: StageKind };