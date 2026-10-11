// Contrato de transcript-plus: el valor de sesión que avanza los contadores
// en curso (epoch ms del último tick del reloj).
declare module 'claude-code' {
  interface PluginState {
    'transcript-plus': { second: number }
  }
}
