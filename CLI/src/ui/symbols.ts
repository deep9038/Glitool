
export const symbols = {
    // input prefixes
    prompt:        '›',
    confirmPrompt: '?',

    // status
    statusDot: '■',

    // tool/agent state
    done:    '✓',
    running: '●',
    queued:  '◌',

    // diff
    add:    '+',
    remove: '-',

    // misc
    arrow:   '→',
    warning: '!',
} as const;

// Spinner frames for "running" state — cycle with setInterval(200ms)
export const spinnerFrames = ['◌', '◐', '●', '◑'] as const;