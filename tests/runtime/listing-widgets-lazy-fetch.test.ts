/// <reference types="jest" />
/**
 * Listing-page widgets — each one asks its API only when the visitor is about to see it.
 *
 * Before: a listing page fired its widget requests (/api/nearby-poi, /api/market, /api/schools/nearby, /api/transit/nearby, /api/listings/similar, /api/listings/building) the moment
 * it hydrated, for every visitor and every bot that runs JavaScript, whether or not anyone scrolled that far. /api/market and
 * /api/listings/similar reach the database and, on a fallback path, live Cotality; /api/listings/building queries live Cotality (cached);
 * /api/nearby-poi reaches a public OpenStreetMap server. Vercel runtime errors for 2026-08-13 → 2026-11-02 include 3,847 Overpass connect
 * timeouts and 38 thirty-second function timeouts; that this fan-out caused them was not established.
 *
 * The REAL components are rendered into a real DOM (jsdom + react-dom/client) with a stand-in IntersectionObserver the test drives,
 * and a stand-in fetch the test reads. What is checked is what a visitor's browser would be asked, not source text.
 */
// A module (not a global script): the names below must not leak into the global `React` namespace.
export {};
const { JSDOM } = require('jsdom');

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: (entries: unknown[]) => void, public readonly options?: { rootMargin?: string }) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  unobserve() { /* not used by the hook */ }
  disconnect() { this.disconnected = true; }
  takeRecords() { return []; }
  trigger(isIntersecting: boolean) {
    this.callback(this.observed.map((target) => ({ target, isIntersecting })));
  }
}
const liveObservers = () => FakeIntersectionObserver.instances.filter((o) => !o.disconnected);

let dom: any;
let ReactLib: any;
let createRoot: (el: Element) => { render: (n: any) => void; unmount: () => void };
let act: (fn: () => void | Promise<void>) => any;
const components: Record<string, any> = {};
const mounted: Array<{ unmount: () => void }> = [];
let fetchMock: jest.Mock;

const COORDS = { latitude: 40.7712, longitude: -73.9612 };
const WIDGETS = [
  {
    name: 'NeighborhoodExplorer',
    path: '@/app/components/NeighborhoodExplorer',
    props: { ...COORDS, address: '151 E 85th Street', borough: 'Manhattan' },
    url: '/api/nearby-poi?',
    has: 'lat=40.7712',
    body: { categories: [] },
  },
  {
    name: 'MarketSnapshot',
    path: '@/app/components/MarketSnapshot',
    props: { neighborhood: 'Upper East Side', borough: 'Manhattan', listPrice: 1425000, pricePerSqft: null, listingType: 'sale' },
    url: '/api/market?',
    has: 'borough=Manhattan',
    body: {},
  },
  {
    name: 'SchoolInfo',
    path: '@/app/components/SchoolInfo',
    props: COORDS,
    url: '/api/schools/nearby?',
    has: 'lat=40.7712',
    body: { groups: [] },
  },
  {
    name: 'TransitSidebarSummary',
    path: '@/app/components/TransitSidebarSummary',
    props: COORDS,
    url: '/api/transit/nearby?',
    has: 'lat=40.7712',
    body: { stations: [], transitScore: 0 },
  },
  {
    name: 'SimilarListings',
    path: '@/app/components/SimilarListings',
    props: { listingType: 'sale', beds: 3, listPrice: 3295000, postalCode: '10028', neighborhood: 'Upper East Side', currentListingId: 'RLS90000001' },
    url: '/api/listings/similar?',
    has: 'excludeId=RLS90000001',
    body: { listings: [] },
  },
  {
    name: 'BuildingUnits',
    path: '@/app/components/BuildingUnits',
    props: { streetNumber: '151', streetName: 'E 85th Street', postalCode: '10028', currentListingId: 'RLS90000001' },
    url: '/api/listings/building?',
    has: 'excludeId=RLS90000001',
    body: { activeUnits: [], saleHistory: [] },
  },
] as const;

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  g.Event = dom.window.Event;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  jest.isolateModules(() => {
    ReactLib = require('react');
    ({ createRoot } = require('react-dom/client'));
    ({ act } = require('react-dom/test-utils'));
    for (const w of WIDGETS) components[w.name] = require(w.path).default;
  });
});

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  (globalThis as any).IntersectionObserver = FakeIntersectionObserver;
  (globalThis as any).window.IntersectionObserver = FakeIntersectionObserver;
  fetchMock = jest.fn(async (url: string) => {
    const widget = WIDGETS.find((w) => String(url).startsWith(w.url));
    return { ok: true, status: 200, json: async () => widget?.body ?? {} };
  });
  (globalThis as any).fetch = fetchMock;
});

afterEach(async () => {
  while (mounted.length) {
    const root = mounted.pop()!;
    await act(async () => root.unmount());
  }
  document.body.innerHTML = '';
});

afterAll(() => {
  const g = globalThis as any;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'IS_REACT_ACT_ENVIRONMENT', 'IntersectionObserver', 'fetch']) delete g[k];
});

async function mount(widget: (typeof WIDGETS)[number]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(root);
  await act(async () => root.render(ReactLib.createElement(components[widget.name], widget.props)));
  return { container, root };
}

const requestsFor = (widget: (typeof WIDGETS)[number]) =>
  fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith(widget.url));

const comesIntoView = () => act(async () => { for (const o of liveObservers()) o.trigger(true); });
const staysOutOfView = () => act(async () => { for (const o of liveObservers()) o.trigger(false); });

describe.each(WIDGETS)('$name', (widget) => {
  it('renders and waits: it asks its API nothing while it is far from the viewport', async () => {
    await mount(widget);
    expect(liveObservers().length).toBeGreaterThan(0);
    expect(liveObservers().some((o) => o.observed.length > 0)).toBe(true);
    expect(requestsFor(widget)).toEqual([]);
  });

  it('still waits when the observer reports it is not intersecting', async () => {
    await mount(widget);
    await staysOutOfView();
    expect(requestsFor(widget)).toEqual([]);
  });

  it('asks once, for its own place or listing, when it comes into view', async () => {
    await mount(widget);
    await comesIntoView();
    const requests = requestsFor(widget);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain(widget.has);
  });

  it('is revealed AHEAD of the viewport, so the answer is there by the time it is scrolled to', async () => {
    await mount(widget);
    const margins = liveObservers().map((o) => o.options?.rootMargin ?? '');
    expect(margins.length).toBeGreaterThan(0);
    for (const m of margins) {
      const px = Number.parseInt(m, 10);
      expect(m).toMatch(/px/);
      expect(px).toBeGreaterThanOrEqual(200);
    }
  });

  it('once it has been seen it does not ask again (scrolling away and back) and stops observing', async () => {
    await mount(widget);
    await comesIntoView();
    await staysOutOfView();
    await comesIntoView();
    expect(requestsFor(widget)).toHaveLength(1);
    expect(liveObservers()).toHaveLength(0);
  });

  it('a visitor who leaves before reaching it costs its API nothing, and leaves no observer behind', async () => {
    const { root } = await mount(widget);
    await act(async () => root.unmount());
    mounted.pop();
    expect(requestsFor(widget)).toEqual([]);
    expect(liveObservers()).toHaveLength(0);
  });

  it('a browser with no IntersectionObserver still gets the widget', async () => {
    delete (globalThis as any).IntersectionObserver;
    delete (globalThis as any).window.IntersectionObserver;
    await mount(widget);
    expect(requestsFor(widget)).toHaveLength(1);
  });
});
