import { toEmbedUrl } from '@/lib/media/embed-url';

// Live REBNY IDX Plus delivers video as VirtualTourURLUnbranded YouTube links in
// watch/shorts/youtu.be form (verified live 2026-07-05). These must be converted to
// /embed/ or YouTube refuses to iframe them — which is why the Video/3D tabs were blank.
describe('toEmbedUrl — listing video/tour embed normalization', () => {
  it('converts a youtube watch URL to embed', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=RM4ef1CIo2k')).toBe('https://www.youtube.com/embed/RM4ef1CIo2k');
  });
  it('converts a youtube shorts URL to embed', () => {
    expect(toEmbedUrl('https://youtube.com/shorts/FpkZHPV5p9k')).toBe('https://www.youtube.com/embed/FpkZHPV5p9k');
  });
  it('converts a youtu.be short link to embed', () => {
    expect(toEmbedUrl('https://youtu.be/abc123XYZ')).toBe('https://www.youtube.com/embed/abc123XYZ');
  });
  it('passes an already-embed URL through unchanged', () => {
    expect(toEmbedUrl('https://www.youtube.com/embed/xyz')).toBe('https://www.youtube.com/embed/xyz');
  });
  it('converts a vimeo URL to the player embed', () => {
    expect(toEmbedUrl('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789');
  });
  it('leaves a non-video URL unchanged', () => {
    expect(toEmbedUrl('https://matterport.com/show/?m=abc')).toBe('https://matterport.com/show/?m=abc');
  });
  it('leaves an unparseable value unchanged', () => {
    expect(toEmbedUrl('not-a-url')).toBe('not-a-url');
  });
});
