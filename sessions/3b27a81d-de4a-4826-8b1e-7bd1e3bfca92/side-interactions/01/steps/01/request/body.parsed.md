# Prompt del Side-request
Crea 3 subagentes en paralelo con estas tareas específicas:
1- Subagente A (WebFetch simple): Haz WebFetch de https://www.example.com y devuelve el título de la página + primer párrafo.
2- Subagente B (WebSearch simple): Busca "Claude Code subagents documentation" y devuelve los 3 primeros resultados con URLs.
3- Subagente C (WebSearch + 2 WebFetch): Busca "Anthropic API changelog" y luego haz WebFetch de las 2 páginas oficiales más relevantes. Devuelve título + fecha de última actualización de cada una.

Mantén el agente principal activo esperando las respuestas, maneja el workflow agéntico de forma síncrona desde el agente principal, mientras los subagentes se ejecutan en paralelo. Evita usar la función de agentes en background.

<!-- model: inclusionai/ling-2.6-1t:free, max_tokens: 32000 -->
