export interface PlanStep{
    id: number;
    action: string;
    target: string;
    depends_on: number[]; // IDs of steps this step depends on
    why: string;
}


export interface ExecutionGroup {
    type: 'parallel' | 'seq';
    stepIds: number[];
}

export interface Topology {
    groups: ExecutionGroup[];
}
