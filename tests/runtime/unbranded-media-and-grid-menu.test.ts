// Owner rules 2026-10-26:
//  - "the videos and media use unbranded": every video / 3D tour the CRM shows comes from the live
//    Property VirtualTourURLUnbranded/2/3 links; the branded fields are never read. Live that day:
//    15,364 on-market rows, 1,737 with an unbranded link, 336 with a branded link — all 336 also
//    unbranded, none branded-only; Media holds 0 Video and 0 UnbrandedVirtualTour rows.
//  - "list should be list, the grid is where the different views live in": the results toolbar
//    button always reads "Grid" and opens the views (Gallery, List, Short Summary, Summary,
//    Master Details) plus the List column layouts.
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadListingViewerLive } from './helpers';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r/g, '');
const sale = read('public/crm/SALE-FORM-WITH-TOOLS.html');
const rental = read('public/crm/RENTAL-FORM-WITH-TOOLS.html');
const built = read('public/crm/index-built.html');
const dispatcher = read('public/crm/js/render/render-dispatcher.js');
const mapper = read('lib/search/crm-idx-mapper.ts');
const pagination = read('public/crm/js/search/pagination.js');

describe('videos and media use the unbranded links', () => {
  it('the agent search mapper reads only VirtualTourURLUnbranded/2/3', () => {
    expect(mapper).toMatch(/const TOUR_FIELDS = \["VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3"\] as const;/);
    expect(mapper).not.toMatch(/"VirtualTourURLBranded/);
    expect(mapper).toMatch(/videoTourUrl: firstTour\("video"\)/);
  });

  it('the detail page never labels a tour "(branded)"', () => {
    expect(pagination).not.toMatch(/\(branded\)/);
    expect(built).not.toMatch(/\(branded\)/);
  });

  it('rental viewer: the Add form\'s six tour boxes, of which only the Unbranded Tour URL claims a field; the video boxes are filled from the live record', () => {
    const prefix = 'rental', html = rental;
    expect(html).not.toMatch(/data-concept="VirtualTourURLBranded"/);          // the branded field is never read or claimed
    // the viewer carries the Add form's six boxes; only the Unbranded Tour URL claims a Cotality field (Maya, 2026-10-09 — crm-tour-box-claims); the
    // video boxes are filled by the live loader from the classified tours, the other tour boxes by their own keys
    expect(html).toMatch(new RegExp('id="' + prefix + 'MatterportUrl"[^>]*class="field-input">'));
    expect(html).not.toMatch(/RLS\/RESO\/IDX: Video2?URL</); // VideoURL / Video2URL are not live Property fields (HTTP 400, 2026-10-26)
    expect(html).toMatch(new RegExp('id="' + prefix + 'VideoUrl"[^>]*class="field-input">'));
    expect(html).toMatch(new RegExp('id="' + prefix + 'VideoTourUrl"[^>]*class="field-input">'));
    expect(html).toMatch(new RegExp('id="' + prefix + 'VirtualTourUnbranded"[^>]*data-concept="VirtualTourURLUnbranded"'));
    expect(html).toMatch(new RegExp('id="' + prefix + 'VirtualTourUnbranded3"[^>]*class="field-input">'));
    expect(html).not.toMatch(/data-concept="VirtualTourURLUnbranded[23]"/);
    expect(html).toMatch(new RegExp('id="' + prefix + 'VideosCount"'));
    expect(html).not.toMatch(/viewerRenderTours/);                     // the live record carries the video links; the hydration table fills the boxes
  });

  it('sale viewer: the Add form\'s six tour boxes; the four Cotality slots claim their fields (the Sale pages send the three unbranded slots and the branded one, Cotality having no video field: the video boxes are the unbranded slots 2 and 3)', () => {
    expect(sale).toMatch(/id="saleVirtualTourUnbranded"[^>]*data-concept="VirtualTourURLUnbranded"/);
    expect(sale).toMatch(/id="saleVideoUrl"[^>]*data-concept="VirtualTourURLUnbranded2"/);
    expect(sale).toMatch(/id="saleVideoTourUrl"[^>]*data-concept="VirtualTourURLUnbranded3"/);
    expect(sale).toMatch(/id="saleMatterportUrl"[^>]*data-concept="VirtualTourURLBranded"/);
    expect(sale).toMatch(/id="saleVirtualTourUnbranded3"[^>]*class="field-input">/);
    expect(sale).not.toMatch(/RLS\/RESO\/IDX: Video2?URL</);
    expect(sale).toMatch(/id="saleVideosCount"/);
    expect(sale).not.toMatch(/viewerRenderTours/);
  });

  it('sale preview reads the unbranded tour box; rental preview reads the boxes that exist', () => {
    expect(sale).toMatch(/setText\('salePreviewTour', val\('saleVirtualTourUnbranded'/);
    expect(rental).toMatch(/getElementById\('rentalVideoUrl'\)/);
    expect(rental).toMatch(/getElementById\('rentalVirtualTourUnbranded'\)/);
    expect(rental).not.toMatch(/getElementById\('rentalVideoURL'\)/);
  });

  it('the live viewer record carries the tours and VideosCount, and the video boxes read the unbranded links classified as videos', () => {
    const h = loadListingViewerLive();
    const tours = [
      { url: 'https://youtu.be/v1', kind: 'video', embedUrl: 'https://www.youtube.com/embed/v1' },
      { url: 'https://my.matterport.com/show/?m=t1', kind: '3d', embedUrl: 'https://my.matterport.com/show/?m=t1' },
      { url: 'https://vimeo.com/22', kind: 'video', embedUrl: 'https://player.vimeo.com/video/22' },
      { url: 'https://tour.example.com/x', kind: 'link', embedUrl: null },
    ];
    const rec = h.viewerLiveRecord({ lid: 'RLS1', status: 'ACTIVE', tours, videosCount: 2 }, { ListingId: 'RLS1', VirtualTourURLUnbranded: 'https://my.matterport.com/show/?m=t1' }, 'RLS1', 'sale');
    expect(rec.tours).toEqual(tours);
    expect(rec.videos_count).toBe(2);
    expect(rec.raw_data.saleVideoUrl).toBe('https://youtu.be/v1');
    expect(rec.raw_data.saleVideoTourUrl).toBe('https://vimeo.com/22');
    expect(rec.raw_data.VirtualTourURLUnbranded).toBe('https://my.matterport.com/show/?m=t1');   // the 3D box shows the field itself (hydration table)
    // a listing without links leaves the boxes empty and the count unknown
    const none = h.viewerLiveRecord({ lid: 'RLS2', status: 'ACTIVE' }, { ListingId: 'RLS2' }, 'RLS2', 'rental');
    expect(none.raw_data.rentalVideoUrl).toBe('');
    expect(none.videos_count).toBeNull();
  });
});

describe('Grid is where the views live; List is the list', () => {
  const menuStart = built.indexOf('id="viewModeDropdown"');
  const menu = built.slice(menuStart, menuStart + 5000);

  it('the toolbar button always reads "Grid" and names the current view beside it', () => {
    expect(menuStart).toBeGreaterThan(0);
    expect(built).toMatch(/id="viewModeBtn"[^>]*>\s*<i[^>]*id="viewModeIcon"><\/i>\s*<span>Grid<\/span>\s*<span id="viewModeLabel"/);
    expect(dispatcher).toMatch(/VIEW_LABELS = \{ grid: 'List', gallery: 'Gallery', shortSummary: 'Short Summary', summary: 'Summary', masterDetail: 'Master Details' \}/);
    expect(dispatcher).toMatch(/function _syncViewModeControl\(\)/);
    // every render keeps the control in step (also after a reload, when the view comes from localStorage)
    expect(dispatcher).toMatch(/function renderSearchResults\(\) \{\s*var mode = searchResultsState\.viewMode;\s*_syncViewModeControl\(\);/);
  });

  it('the menu lists the five views and the List column layouts', () => {
    const views: Array<[string, string]> = [['gallery', 'Gallery'], ['grid', 'List'], ['shortSummary', 'Short Summary'], ['summary', 'Summary'], ['masterDetail', 'Master Details']];
    for (const [mode, label] of views) {
      expect(menu).toMatch(new RegExp('onclick="setViewMode\\(\'' + mode + '\'\\)" data-view-mode="' + mode + '" role="menuitemradio"[^>]*>\\s*<i[^>]*><\\/i> ' + label + ' <i[^>]*view-mode-check'));
    }
    expect(menu).toMatch(/openGridLayoutsModal\(\)" role="menuitem"[^>]*>\s*<i[^>]*><\/i> List columns/);
    expect(menu).not.toMatch(/data-view-mode="gallery"[^>]*>\s*<i[^>]*><\/i> Grid /);
  });
});
