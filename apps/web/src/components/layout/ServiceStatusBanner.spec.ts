// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ServiceStatusBanner from './ServiceStatusBanner.vue';

/*
  Le point à garantir est double : rien ne s'affiche quand l'API répond, et le
  message qui s'affiche quand elle ne répond pas est celui du client, en
  français. La région aria-live doit exister dans les deux cas, sinon son
  apparition ne serait pas annoncée.
*/

function stubHealth(status: number, body: string, contentType: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } })),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServiceStatusBanner', () => {
  it("n'affiche rien quand l'API répond", async () => {
    stubHealth(200, '{"status":"ok"}', 'application/json');

    const wrapper = mount(ServiceStatusBanner);

    await flushPromises();

    expect(wrapper.find('.alert').exists()).toBe(false);
    // La région reste là, prête à annoncer un message ultérieur.
    expect(wrapper.find('[aria-live]').exists()).toBe(true);
  });

  it('affiche un message en français quand le service est indisponible', async () => {
    stubHealth(
      503,
      JSON.stringify({
        type: 'about:blank',
        title: 'Service indisponible',
        status: 503,
        detail: 'Le service est momentanément indisponible.',
        requestId: 'ab12',
      }),
      PROBLEM_DETAILS_MEDIA_TYPE,
    );

    const wrapper = mount(ServiceStatusBanner);

    await flushPromises();

    expect(wrapper.find('.alert').exists()).toBe(true);
    expect(wrapper.text()).toContain('momentanément indisponible');
    // Avertissement : il interrompt la lecture en cours.
    expect(wrapper.attributes('role')).toBe('alert');
  });

  it('affiche un message quand le réseau est coupé', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const wrapper = mount(ServiceStatusBanner);

    await flushPromises();

    expect(wrapper.text()).toContain('injoignable');
  });

  it("ne prend de la place que lorsqu'il affiche quelque chose", async () => {
    stubHealth(200, '{"status":"ok"}', 'application/json');

    const wrapper = mount(ServiceStatusBanner);

    await flushPromises();

    expect(wrapper.classes()).not.toContain('service-status--shown');
  });
});
