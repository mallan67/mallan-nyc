// Proves the unsubscribe GET/POST rate-limit buckets are SEPARATE at the
// Upstash-limiter construction level: distinct Redis prefixes and distinct
// quotas, so GET traffic (scanners/prefetchers) can never drain the mutating
// POST bucket. Behavioral proof (route level) lives in the /api/unsubscribe
// route tests; this asserts the limiter *configuration*.

const mockSlidingWindow = jest.fn((count: number, window: string) => ({ _sw: { count, window } }));
const mockCtorCalls: Array<{ prefix?: string }> = [];

jest.mock('@upstash/ratelimit', () => ({
  __esModule: true,
  Ratelimit: Object.assign(
    jest.fn(function (opts: { prefix?: string }) {
      mockCtorCalls.push(opts);
      return { limit: async () => ({ success: true }) };
    }),
    { slidingWindow: (c: number, w: string) => mockSlidingWindow(c, w) },
  ),
}));

// Redis must be truthy so the module builds the per-route Upstash limiters.
jest.mock('@/lib/redis', () => ({ __esModule: true, default: { __fake: true } }));

// Importing the module triggers limiter construction at load time.
import '@/lib/middleware/rate-limiter';

describe('unsubscribe rate-limit buckets', () => {
  it('builds a SEPARATE rl:unsubscribe_get limiter distinct from rl:unsubscribe', () => {
    const prefixes = mockCtorCalls.map((c) => c.prefix);
    expect(prefixes).toContain('rl:unsubscribe');
    expect(prefixes).toContain('rl:unsubscribe_get');
  });

  it('gives GET its own generous quota (300/3600s) vs the tight POST quota (20/3600s)', () => {
    // Each spec is wired through Ratelimit.slidingWindow(count, window).
    expect(mockSlidingWindow).toHaveBeenCalledWith(300, '3600 s'); // unsubscribe_get
    expect(mockSlidingWindow).toHaveBeenCalledWith(20, '3600 s');  // unsubscribe (POST)
  });
});

describe('media health rate-limit buckets (GET /api/media/health: each question the CDN did not answer costs Cotality a media request)', () => {
  const windowOf = (prefix: string) => {
    const call = mockCtorCalls.find((c) => c.prefix === prefix) as unknown as { limiter: { _sw: { count: number; window: string } } } | undefined;
    return call?.limiter._sw;
  };

  it('builds a limiter for one visitor (60 a minute) and a separate one for all visitors together (300 a minute), each with its own Redis prefix', () => {
    expect(windowOf('rl:media_health')).toEqual({ count: 60, window: '60 s' });
    expect(windowOf('rl:media_health_global')).toEqual({ count: 300, window: '60 s' });
  });
});
