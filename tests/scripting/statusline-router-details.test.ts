import { describe, it, expect } from 'vitest';
import { applyRouterDetails } from '../../scripting/provider/statusline-router-details.js';
import type { ClaudeSettings } from '../../scripting/shared/claude-settings.js';
import { STATUSLINE_ROUTER_DETAILS_KEY } from '../../scripting/shared/claude-settings.js';

describe('applyRouterDetails', () => {
  it('establece on cuando action = on', () => {
    const result = applyRouterDetails({}, 'on');
    expect(result.env![STATUSLINE_ROUTER_DETAILS_KEY]).toBe('on');
  });

  it('establece off cuando action = off', () => {
    const result = applyRouterDetails({}, 'off');
    expect(result.env![STATUSLINE_ROUTER_DETAILS_KEY]).toBe('off');
  });

  it('toggle desde ausente → on', () => {
    const result = applyRouterDetails({}, 'toggle');
    expect(result.env![STATUSLINE_ROUTER_DETAILS_KEY]).toBe('on');
  });

  it('toggle desde on → off', () => {
    const settings: ClaudeSettings = {
      env: { [STATUSLINE_ROUTER_DETAILS_KEY]: 'on' },
    };
    const result = applyRouterDetails(settings, 'toggle');
    expect(result.env![STATUSLINE_ROUTER_DETAILS_KEY]).toBe('off');
  });

  it('toggle desde off → on', () => {
    const settings: ClaudeSettings = {
      env: { [STATUSLINE_ROUTER_DETAILS_KEY]: 'off' },
    };
    const result = applyRouterDetails(settings, 'toggle');
    expect(result.env![STATUSLINE_ROUTER_DETAILS_KEY]).toBe('on');
  });

  it('preserva otras claves de env', () => {
    const settings: ClaudeSettings = {
      env: {
        ANTHROPIC_API_KEY: 'test-key',
        EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT: '/some/path',
      },
    };
    const result = applyRouterDetails(settings, 'on');
    expect(result.env!['ANTHROPIC_API_KEY']).toBe('test-key');
    expect(result.env!['EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT']).toBe('/some/path');
    expect(result.env![STATUSLINE_ROUTER_DETAILS_KEY]).toBe('on');
  });

  it('preserva otras claves de primer nivel de settings', () => {
    const settings: ClaudeSettings = {
      statusLine: { type: 'command', command: 'tsx router-status.ts', padding: 0 },
    };
    const result = applyRouterDetails(settings, 'off');
    expect(result.statusLine).toEqual(settings.statusLine);
  });

  it('no muta el objeto original', () => {
    const settings: ClaudeSettings = { env: { ANTHROPIC_API_KEY: 'k' } };
    applyRouterDetails(settings, 'on');
    expect(settings.env![STATUSLINE_ROUTER_DETAILS_KEY]).toBeUndefined();
  });
});
