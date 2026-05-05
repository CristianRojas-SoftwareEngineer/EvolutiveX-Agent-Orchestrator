// Contenedores de primer nivel (bajo sessionDir)
export const DIR_MAIN_AGENT = 'main-agent';
export const DIR_SIDE_INTERACTIONS = 'side-interactions';

// Subdirectorio de interacciones bajo main-agent
export const DIR_INTERACTIONS = 'interactions';

// Subdirectorios de una interacción (top-level)
export const DIR_INPUT = 'input';
export const DIR_OUTPUT = 'output';
export const DIR_STEPS = 'steps';

// Subdirectorios dentro de un step
export const DIR_STEP_REQUEST = 'request';
export const DIR_STEP_RESPONSE = 'response';
export const DIR_STEP_THOUGHT = 'thought';

// Sub-agentes
export const PREFIX_SUB_AGENT = 'sub-agent';

// Archivos de metadata
export const FILE_INTERACTION_SEQUENCE = 'interaction-sequence.json';
export const FILE_SESSION_METRICS = 'session-metrics.json';
export const FILE_META = 'meta.json';
export const FILE_STATE = 'state.json';

// Padding (cantidad de dígitos)
export const PAD_INTERACTION = 2;
export const PAD_STEP = 2;
export const PAD_SUB_AGENT = 2;
