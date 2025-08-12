export const config = {
  matcher: [
    // Run middleware on everything EXCEPT these:
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
