export const colors = {
    ink:    '#1f1b16',
    ink2:   '#3b3429',
    muted:  '#8a8170',
    muted2: '#b3a994',
    line:   '#e6ddc9',

    amber:   '#c4732e',
    sage:    '#5a8c5a',
    rust:    '#b54226',
    mustard: '#c69a3a',
    violet:  '#6c5ab8',
    teal:    '#3e8a9a',
} as const;


export type ColorToken = keyof typeof colors;