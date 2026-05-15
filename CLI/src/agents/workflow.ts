import type { PlanStep, ExecutionGroup, Topology } from './types.js';

export function buildTopology(steps: PlanStep[]):Topology{

    const levelMap = new Map<number,number>();


    function getLevel(id: number): number{
        if(levelMap.has(id)) return levelMap.get(id)!;
        const step = steps.find(s=> s.id === id);
        if (!step || step.depends_on.length === 0){
            levelMap.set(id,0);
            return 0;
        }
        const level = Math.max(...step.depends_on.map(getLevel)) + 1;
        levelMap.set(id,level);
        return level;
    }


    steps.forEach(s => getLevel(s.id));

    const byLevel = new Map<number, number[]>();


    for(const [id, level] of levelMap){
        if(!byLevel.has(level)) byLevel.set(level,[]);
        byLevel.get(level)!.push(id);
    }


    const groups: ExecutionGroup[] = [...byLevel.keys()]
        .sort((a,b) => a-b)
        .map(level => {
            const stepIds = byLevel.get(level)!;
            return { type: stepIds.length > 1 ? `parallel` : `seq`, stepIds }
        });

    return { groups };


}



export function formatTopologyAsPlan(topology: Topology,steps: PlanStep[]): string{
    return topology.groups.map((group, i) =>{
        const label = group.type === 'parallel' ? `Group ${i + 1} - run in parallel` : `Group ${ i +1}`;
        const lines = group.stepIds.map(id => {
            const step = steps.find(s => s.id === id);
            return step ? `  Step ${step.id} [${step.action}]\n    Why: ${step.why}`
            : `  Step ${id}`;
        });
        return `${label}:\n${lines.join('\n')}`
    }).join(`\n\n`);
}


export function topologySummary(topology: Topology): string{
    const parallel = topology.groups.filter(g => g.type === 'parallel').length;
    const total = topology.groups.length;
    return `${total} group${total !== 1 ? 's' : ''}, ${parallel} parallel`;
}



