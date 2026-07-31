# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-card-carousel.spec.ts >> Card carousel — desktop >> /search?tab=buy-residential — Next advances the image and the counter
- Location: tests\e2e\search-card-carousel.spec.ts:67:9

# Error details

```
Error: the n/N counter must advance

expect(received).not.toBe(expected) // Object.is equality

Expected: not undefined
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - banner [ref=e3]:
    - generic [ref=e5]:
      - link "MALLANNYC" [ref=e6] [cursor=pointer]:
        - /url: /
      - navigation "Main navigation" [ref=e7]:
        - list [ref=e8]:
          - listitem [ref=e9]:
            - button "Buy" [ref=e11] [cursor=pointer]:
              - text: Buy
              - img [ref=e12]
          - listitem [ref=e14]:
            - button "Rent" [ref=e16] [cursor=pointer]:
              - text: Rent
              - img [ref=e17]
          - listitem [ref=e19]:
            - button "Sell" [ref=e21] [cursor=pointer]:
              - text: Sell
              - img [ref=e22]
          - listitem [ref=e24]:
            - button "Mallan Exclusives" [ref=e26] [cursor=pointer]:
              - text: Mallan Exclusives
              - img [ref=e27]
          - listitem [ref=e29]:
            - button "Neighborhoods" [ref=e31] [cursor=pointer]:
              - text: Neighborhoods
              - img [ref=e32]
          - listitem [ref=e34]:
            - button "More" [ref=e36] [cursor=pointer]:
              - text: More
              - img [ref=e37]
          - listitem [ref=e39]:
            - link "Saved Properties" [ref=e40] [cursor=pointer]:
              - /url: /favorites
              - img [ref=e41]
          - listitem [ref=e43]:
            - link "Call (646) 258-4460" [ref=e44] [cursor=pointer]:
              - /url: tel:+16462584460
              - img [ref=e45]
              - generic [ref=e47]: (646) 258-4460
          - listitem
          - listitem [ref=e48]:
            - link "Sign In" [ref=e49] [cursor=pointer]:
              - /url: /sign-in
  - main [ref=e50]:
    - main [ref=e53]:
      - generic [ref=e54]:
        - heading "Search Properties — Mallan Real Estate" [level=1] [ref=e55]
        - search "Property search filters" [ref=e56]:
          - generic [ref=e57]:
            - generic [ref=e58]:
              - generic [ref=e59]:
                - button "Buy" [ref=e60] [cursor=pointer]
                - button "Buy Commercial" [ref=e61] [cursor=pointer]
                - button "Rent" [ref=e62] [cursor=pointer]
                - button "Rent Commercial" [ref=e63] [cursor=pointer]
              - generic [ref=e65]:
                - generic [ref=e66]: Search properties
                - generic [ref=e67]:
                  - img
                  - combobox "Search by neighborhood, ZIP, address, or listing number" [ref=e68]
            - generic [ref=e69]:
              - generic [ref=e70]:
                - combobox "Minimum price" [ref=e71] [cursor=pointer]:
                  - option "Min Price" [selected]
                  - option "$250K"
                  - option "$500K"
                  - option "$750K"
                  - option "$1M"
                  - option "$1.5M"
                  - option "$2.5M"
                  - option "$3.5M"
                  - option "$4.5M"
                  - option "$5M"
                  - option "$7M"
                  - option "$9M"
                  - option "$12M"
                  - option "$20M"
                  - option "$50M+"
                - generic [ref=e72]: –
                - combobox "Maximum price" [ref=e73] [cursor=pointer]:
                  - option "No Max" [selected]
                  - option "$250K"
                  - option "$500K"
                  - option "$750K"
                  - option "$1M"
                  - option "$1.5M"
                  - option "$2.5M"
                  - option "$3.5M"
                  - option "$4.5M"
                  - option "$5M"
                  - option "$7M"
                  - option "$9M"
                  - option "$12M"
                  - option "$20M"
                  - option "$50M+"
              - generic [ref=e74]:
                - combobox "Min bedrooms" [ref=e75] [cursor=pointer]:
                  - option "Beds" [selected]
                  - option "Studio"
                  - option "1"
                  - option "2"
                  - option "3"
                  - option "4"
                - generic [ref=e76]: –
                - combobox "Max bedrooms" [ref=e77] [cursor=pointer]:
                  - option "Max" [selected]
                  - option "Studio"
                  - option "1"
                  - option "2"
                  - option "3"
                  - option "4+"
              - generic [ref=e78]:
                - combobox "Min bathrooms" [ref=e79] [cursor=pointer]:
                  - option "Baths" [selected]
                  - option "1"
                  - option "1.5"
                  - option "2"
                  - option "3"
                - generic [ref=e80]: –
                - combobox "Max bathrooms" [ref=e81] [cursor=pointer]:
                  - option "Max" [selected]
                  - option "1"
                  - option "1.5"
                  - option "2"
                  - option "3+"
              - button "Neighborhoods" [ref=e84] [cursor=pointer]:
                - img [ref=e85]
                - text: Neighborhoods
              - button "Open filters" [ref=e88] [cursor=pointer]:
                - img [ref=e89]
                - text: Filters
              - combobox "Sort order" [ref=e91]:
                - 'option "Price: High → Low" [selected]'
                - 'option "Price: Low → High"'
                - option "Newest"
                - option "Largest"
              - generic [ref=e92]:
                - button "split view" [ref=e93] [cursor=pointer]:
                  - img [ref=e94]
                - button "all-listings view" [ref=e97] [cursor=pointer]:
                  - img [ref=e98]
                - button "all-map view" [ref=e103] [cursor=pointer]:
                  - img [ref=e104]
                - button "grid view" [ref=e107] [cursor=pointer]:
                  - img [ref=e108]
                - button "list view" [ref=e118] [cursor=pointer]:
                  - img [ref=e119]
              - button "Save Search" [disabled] [ref=e121]:
                - img [ref=e122]
                - text: Save Search
              - paragraph [ref=e124]: 8,375 properties
        - generic [ref=e126]:
          - generic [ref=e128]:
            - generic [ref=e130]:
              - generic [ref=e131]:
                - link "217 W 57th Street" [ref=e132] [cursor=pointer]:
                  - /url: /listing/217-w-57th-street-apt-127-128-new-york-city-ny-10019/rls20059088
                  - img "217 W 57th Street" [ref=e134]
                - button "Save to favorites" [ref=e136] [cursor=pointer]:
                  - img [ref=e137]
                - generic [ref=e139]: 2/34
                - generic "3D tour available" [ref=e141]:
                  - img [ref=e142]
                  - text: 3D Tour
                - button "Previous photo" [ref=e144] [cursor=pointer]:
                  - img [ref=e145]
                - button "Next photo" [active] [ref=e147] [cursor=pointer]:
                  - img [ref=e148]
              - 'link "$128,000,000 8 Beds · 9.5 Bath · 11,535 SF 217 W 57th Street, 127/128 Condo · Manhattan CC: $20,766/mo RLS · Listing Courtesy of Compass" [ref=e156] [cursor=pointer]':
                - /url: /listing/217-w-57th-street-apt-127-128-new-york-city-ny-10019/rls20059088
                - paragraph [ref=e157]: $128,000,000
                - generic [ref=e158]:
                  - generic [ref=e159]: 8 Beds
                  - generic [ref=e160]: ·
                  - generic [ref=e161]: 9.5 Bath
                  - generic [ref=e162]: ·
                  - generic [ref=e163]: 11,535 SF
                - paragraph [ref=e164]: 217 W 57th Street, 127/128
                - paragraph [ref=e165]: Condo · Manhattan
                - paragraph [ref=e166]: "CC: $20,766/mo"
                - paragraph [ref=e167]: RLS · Listing Courtesy of Compass
            - generic [ref=e169]:
              - generic [ref=e170]:
                - link "432 Park Avenue" [ref=e171] [cursor=pointer]:
                  - /url: /listing/432-park-avenue-apt-64-new-york-city-ny-10022/rls20091070
                  - img "432 Park Avenue" [ref=e173]
                - button "Save to favorites" [ref=e175] [cursor=pointer]:
                  - img [ref=e176]
                - generic [ref=e178]: 1/22
                - button "Previous photo" [ref=e179] [cursor=pointer]:
                  - img [ref=e180]
                - button "Next photo" [ref=e182] [cursor=pointer]:
                  - img [ref=e183]
              - 'link "$90,000,000 4 Beds · 5.5 Bath · 8,038 SF 432 Park Avenue, 64 Condo · Manhattan CC: $34,000/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e191] [cursor=pointer]':
                - /url: /listing/432-park-avenue-apt-64-new-york-city-ny-10022/rls20091070
                - paragraph [ref=e192]: $90,000,000
                - generic [ref=e193]:
                  - generic [ref=e194]: 4 Beds
                  - generic [ref=e195]: ·
                  - generic [ref=e196]: 5.5 Bath
                  - generic [ref=e197]: ·
                  - generic [ref=e198]: 8,038 SF
                - paragraph [ref=e199]: 432 Park Avenue, 64
                - paragraph [ref=e200]: Condo · Manhattan
                - paragraph [ref=e201]: "CC: $34,000/mo"
                - paragraph [ref=e202]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - generic [ref=e204]:
              - generic [ref=e205]:
                - link "157 W 57th Street" [ref=e206] [cursor=pointer]:
                  - /url: /listing/157-w-57th-street-apt-64-new-york-city-ny-10019/rls20033199
                  - img "157 W 57th Street" [ref=e208]
                - button "Save to favorites" [ref=e210] [cursor=pointer]:
                  - img [ref=e211]
                - generic [ref=e213]: 1/7
                - button "Previous photo" [ref=e214] [cursor=pointer]:
                  - img [ref=e215]
                - button "Next photo" [ref=e217] [cursor=pointer]:
                  - img [ref=e218]
              - 'link "$90,000,000 8 Beds · 7 Bath · 10,000 SF 157 W 57th Street, 64 Condo · Manhattan CC: $16,000/mo RLS · Listing Courtesy of Modlin Group LLC" [ref=e226] [cursor=pointer]':
                - /url: /listing/157-w-57th-street-apt-64-new-york-city-ny-10019/rls20033199
                - paragraph [ref=e227]: $90,000,000
                - generic [ref=e228]:
                  - generic [ref=e229]: 8 Beds
                  - generic [ref=e230]: ·
                  - generic [ref=e231]: 7 Bath
                  - generic [ref=e232]: ·
                  - generic [ref=e233]: 10,000 SF
                - paragraph [ref=e234]: 157 W 57th Street, 64
                - paragraph [ref=e235]: Condo · Manhattan
                - paragraph [ref=e236]: "CC: $16,000/mo"
                - paragraph [ref=e237]: RLS · Listing Courtesy of Modlin Group LLC
            - generic [ref=e239]:
              - generic [ref=e240]:
                - link "432 Park Avenue" [ref=e241] [cursor=pointer]:
                  - /url: /listing/432-park-avenue-apt-ph88-new-york-city-ny-10022/rls20088532
                  - img "432 Park Avenue" [ref=e243]
                - button "Save to favorites" [ref=e245] [cursor=pointer]:
                  - img [ref=e246]
                - generic [ref=e248]: 1/15
                - generic "Video available" [ref=e250]:
                  - img [ref=e251]
                  - text: Video
                - button "Previous photo" [ref=e253] [cursor=pointer]:
                  - img [ref=e254]
                - button "Next photo" [ref=e256] [cursor=pointer]:
                  - img [ref=e257]
              - 'link "$88,500,000 4 Beds · 6.5 Bath · 8,200 SF 432 Park Avenue, PH88 Condo · Manhattan CC: $34,405/mo RLS · Listing Courtesy of Compass" [ref=e265] [cursor=pointer]':
                - /url: /listing/432-park-avenue-apt-ph88-new-york-city-ny-10022/rls20088532
                - paragraph [ref=e266]: $88,500,000
                - generic [ref=e267]:
                  - generic [ref=e268]: 4 Beds
                  - generic [ref=e269]: ·
                  - generic [ref=e270]: 6.5 Bath
                  - generic [ref=e271]: ·
                  - generic [ref=e272]: 8,200 SF
                - paragraph [ref=e273]: 432 Park Avenue, PH88
                - paragraph [ref=e274]: Condo · Manhattan
                - paragraph [ref=e275]: "CC: $34,405/mo"
                - paragraph [ref=e276]: RLS · Listing Courtesy of Compass
            - generic [ref=e278]:
              - generic [ref=e279]:
                - link "125 Perry Street" [ref=e280] [cursor=pointer]:
                  - /url: /listing/125-perry-street-apt-phe-new-york-city-ny-10014/rls20060201
                  - img "125 Perry Street" [ref=e282]
                - button "Save to favorites" [ref=e284] [cursor=pointer]:
                  - img [ref=e285]
                - generic [ref=e287]: 1/13
                - button "Previous photo" [ref=e288] [cursor=pointer]:
                  - img [ref=e289]
                - button "Next photo" [ref=e291] [cursor=pointer]:
                  - img [ref=e292]
              - 'link "$85,000,000 6 Beds · 9 Bath · 7,700 SF 125 Perry Street, PHE Condo · Manhattan CC: $21,769/mo RLS · Listing Courtesy of Compass" [ref=e300] [cursor=pointer]':
                - /url: /listing/125-perry-street-apt-phe-new-york-city-ny-10014/rls20060201
                - paragraph [ref=e301]: $85,000,000
                - generic [ref=e302]:
                  - generic [ref=e303]: 6 Beds
                  - generic [ref=e304]: ·
                  - generic [ref=e305]: 9 Bath
                  - generic [ref=e306]: ·
                  - generic [ref=e307]: 7,700 SF
                - paragraph [ref=e308]: 125 Perry Street, PHE
                - paragraph [ref=e309]: Condo · Manhattan
                - paragraph [ref=e310]: "CC: $21,769/mo"
                - paragraph [ref=e311]: RLS · Listing Courtesy of Compass
            - generic [ref=e313]:
              - generic [ref=e314]:
                - link "50 W 66th Street" [ref=e315] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-62-new-york-city-ny-10023/rls20061539
                  - img "50 W 66th Street" [ref=e317]
                - button "Save to favorites" [ref=e319] [cursor=pointer]:
                  - img [ref=e320]
                - generic [ref=e322]: 1/22
                - button "Previous photo" [ref=e323] [cursor=pointer]:
                  - img [ref=e324]
                - button "Next photo" [ref=e326] [cursor=pointer]:
                  - img [ref=e327]
              - 'link "$85,000,000 6 Beds · 8 Bath · 9,678 SF 50 W 66th Street, 62 Condo · Manhattan CC: $16,936/mo RLS · Listing Courtesy of Extell Marketing Group LLC" [ref=e335] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-62-new-york-city-ny-10023/rls20061539
                - paragraph [ref=e336]: $85,000,000
                - generic [ref=e337]:
                  - generic [ref=e338]: 6 Beds
                  - generic [ref=e339]: ·
                  - generic [ref=e340]: 8 Bath
                  - generic [ref=e341]: ·
                  - generic [ref=e342]: 9,678 SF
                - paragraph [ref=e343]: 50 W 66th Street, 62
                - paragraph [ref=e344]: Condo · Manhattan
                - paragraph [ref=e345]: "CC: $16,936/mo"
                - paragraph [ref=e346]: RLS · Listing Courtesy of Extell Marketing Group LLC
            - generic [ref=e348]:
              - generic [ref=e349]:
                - link "50 W 66th Street" [ref=e350] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-62-new-york-city-ny-10023/rls10956475
                  - img "50 W 66th Street" [ref=e352]
                - button "Save to favorites" [ref=e354] [cursor=pointer]:
                  - img [ref=e355]
                - generic [ref=e357]: 1/33
                - button "Previous photo" [ref=e358] [cursor=pointer]:
                  - img [ref=e359]
                - button "Next photo" [ref=e361] [cursor=pointer]:
                  - img [ref=e362]
              - 'link "$85,000,000 6 Beds · 8 Bath · 9,678 SF 50 W 66th Street, 62 Condo · Manhattan CC: $16,921/mo RLS · Listing Courtesy of Corcoran Group" [ref=e370] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-62-new-york-city-ny-10023/rls10956475
                - paragraph [ref=e371]: $85,000,000
                - generic [ref=e372]:
                  - generic [ref=e373]: 6 Beds
                  - generic [ref=e374]: ·
                  - generic [ref=e375]: 8 Bath
                  - generic [ref=e376]: ·
                  - generic [ref=e377]: 9,678 SF
                - paragraph [ref=e378]: 50 W 66th Street, 62
                - paragraph [ref=e379]: Condo · Manhattan
                - paragraph [ref=e380]: "CC: $16,921/mo"
                - paragraph [ref=e381]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e383]:
              - generic [ref=e384]:
                - link "50 W 66th Street" [ref=e385] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-62-new-york-city-ny-10023/rls10971329
                  - img "50 W 66th Street" [ref=e387]
                - button "Save to favorites" [ref=e389] [cursor=pointer]:
                  - img [ref=e390]
                - generic [ref=e392]: 1/23
                - button "Previous photo" [ref=e393] [cursor=pointer]:
                  - img [ref=e394]
                - button "Next photo" [ref=e396] [cursor=pointer]:
                  - img [ref=e397]
              - 'link "$85,000,000 6 Beds · 8 Bath · 9,678 SF 50 W 66th Street, 62 Condo · Manhattan CC: $16,921/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e405] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-62-new-york-city-ny-10023/rls10971329
                - paragraph [ref=e406]: $85,000,000
                - generic [ref=e407]:
                  - generic [ref=e408]: 6 Beds
                  - generic [ref=e409]: ·
                  - generic [ref=e410]: 8 Bath
                  - generic [ref=e411]: ·
                  - generic [ref=e412]: 9,678 SF
                - paragraph [ref=e413]: 50 W 66th Street, 62
                - paragraph [ref=e414]: Condo · Manhattan
                - paragraph [ref=e415]: "CC: $16,921/mo"
                - paragraph [ref=e416]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - generic [ref=e418]:
              - generic [ref=e419]:
                - link "80 Columbus Circle" [ref=e420] [cursor=pointer]:
                  - /url: /listing/80-columbus-circle-apt-80thfloor-new-york-city-ny-10023/rls20068338
                  - img "80 Columbus Circle" [ref=e422]
                - button "Save to favorites" [ref=e424] [cursor=pointer]:
                  - img [ref=e425]
                - generic [ref=e427]: 1/31
                - button "Previous photo" [ref=e428] [cursor=pointer]:
                  - img [ref=e429]
                - button "Next photo" [ref=e431] [cursor=pointer]:
                  - img [ref=e432]
              - 'link "$80,000,000 6 Beds · 8 Bath · 8,332 SF 80 Columbus Circle, 80th Floor Condo · Manhattan CC: $27,394/mo RLS · Listing Courtesy of Sothebys International Realty" [ref=e440] [cursor=pointer]':
                - /url: /listing/80-columbus-circle-apt-80thfloor-new-york-city-ny-10023/rls20068338
                - paragraph [ref=e441]: $80,000,000
                - generic [ref=e442]:
                  - generic [ref=e443]: 6 Beds
                  - generic [ref=e444]: ·
                  - generic [ref=e445]: 8 Bath
                  - generic [ref=e446]: ·
                  - generic [ref=e447]: 8,332 SF
                - paragraph [ref=e448]: 80 Columbus Circle, 80th Floor
                - paragraph [ref=e449]: Condo · Manhattan
                - paragraph [ref=e450]: "CC: $27,394/mo"
                - paragraph [ref=e451]: RLS · Listing Courtesy of Sothebys International Realty
            - generic [ref=e453]:
              - generic [ref=e454]:
                - link "220 Central Park S" [ref=e455] [cursor=pointer]:
                  - /url: /listing/220-central-park-s-apt-62-new-york-city-ny-10019/rls20077721
                  - img "220 Central Park S" [ref=e457]
                - button "Save to favorites" [ref=e459] [cursor=pointer]:
                  - img [ref=e460]
                - generic [ref=e462]: 1/19
                - button "Previous photo" [ref=e463] [cursor=pointer]:
                  - img [ref=e464]
                - button "Next photo" [ref=e466] [cursor=pointer]:
                  - img [ref=e467]
              - 'link "$79,900,000 4 Beds · 6 Bath · 5,935 SF 220 Central Park S, 62 Condo · Manhattan CC: $26,975/mo RLS · Listing Courtesy of Corcoran Group" [ref=e475] [cursor=pointer]':
                - /url: /listing/220-central-park-s-apt-62-new-york-city-ny-10019/rls20077721
                - paragraph [ref=e476]: $79,900,000
                - generic [ref=e477]:
                  - generic [ref=e478]: 4 Beds
                  - generic [ref=e479]: ·
                  - generic [ref=e480]: 6 Bath
                  - generic [ref=e481]: ·
                  - generic [ref=e482]: 5,935 SF
                - paragraph [ref=e483]: 220 Central Park S, 62
                - paragraph [ref=e484]: Condo · Manhattan
                - paragraph [ref=e485]: "CC: $26,975/mo"
                - paragraph [ref=e486]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e488]:
              - generic [ref=e489]:
                - link "50 Central Park S" [ref=e490] [cursor=pointer]:
                  - /url: /listing/50-central-park-s-apt-30-31-new-york-city-ny-10019/rls20099737
                  - img "50 Central Park S" [ref=e492]
                - button "Save to favorites" [ref=e494] [cursor=pointer]:
                  - img [ref=e495]
                - generic [ref=e497]: 1/21
                - generic "Video available" [ref=e499]:
                  - img [ref=e500]
                  - text: Video
                - button "Previous photo" [ref=e502] [cursor=pointer]:
                  - img [ref=e503]
                - button "Next photo" [ref=e505] [cursor=pointer]:
                  - img [ref=e506]
              - 'link "$70,000,000 3 Beds · 5 Bath · 10,875 SF 50 Central Park S, 30/31 Condo · Manhattan CC: $31,362/mo RLS · Listing Courtesy of Sothebys International Realty" [ref=e514] [cursor=pointer]':
                - /url: /listing/50-central-park-s-apt-30-31-new-york-city-ny-10019/rls20099737
                - paragraph [ref=e515]: $70,000,000
                - generic [ref=e516]:
                  - generic [ref=e517]: 3 Beds
                  - generic [ref=e518]: ·
                  - generic [ref=e519]: 5 Bath
                  - generic [ref=e520]: ·
                  - generic [ref=e521]: 10,875 SF
                - paragraph [ref=e522]: 50 Central Park S, 30/31
                - paragraph [ref=e523]: Condo · Manhattan
                - paragraph [ref=e524]: "CC: $31,362/mo"
                - paragraph [ref=e525]: RLS · Listing Courtesy of Sothebys International Realty
            - generic [ref=e527]:
              - generic [ref=e528]:
                - link "50 Central Park S" [ref=e529] [cursor=pointer]:
                  - /url: /listing/50-central-park-s-apt-30-31-new-york-city-ny-10019/rls20099772
                  - img "50 Central Park S" [ref=e531]
                - button "Save to favorites" [ref=e533] [cursor=pointer]:
                  - img [ref=e534]
                - generic [ref=e536]: 1/20
                - button "Previous photo" [ref=e537] [cursor=pointer]:
                  - img [ref=e538]
                - button "Next photo" [ref=e540] [cursor=pointer]:
                  - img [ref=e541]
              - 'link "$70,000,000 3 Beds · 5 Bath · 10,875 SF 50 Central Park S, 30/31 Condo · Manhattan CC: $31,363/mo RLS · Listing Courtesy of Corcoran Group" [ref=e549] [cursor=pointer]':
                - /url: /listing/50-central-park-s-apt-30-31-new-york-city-ny-10019/rls20099772
                - paragraph [ref=e550]: $70,000,000
                - generic [ref=e551]:
                  - generic [ref=e552]: 3 Beds
                  - generic [ref=e553]: ·
                  - generic [ref=e554]: 5 Bath
                  - generic [ref=e555]: ·
                  - generic [ref=e556]: 10,875 SF
                - paragraph [ref=e557]: 50 Central Park S, 30/31
                - paragraph [ref=e558]: Condo · Manhattan
                - paragraph [ref=e559]: "CC: $31,363/mo"
                - paragraph [ref=e560]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e562]:
              - generic [ref=e563]:
                - link "4 E 79th Street" [ref=e564] [cursor=pointer]:
                  - /url: /listing/4-e-79th-street-new-york-city-ny-10075/rls20061488
                  - img "4 E 79th Street" [ref=e566]
                - button "Save to favorites" [ref=e568] [cursor=pointer]:
                  - img [ref=e569]
                - generic [ref=e571]: 1/30
                - button "Previous photo" [ref=e572] [cursor=pointer]:
                  - img [ref=e573]
                - button "Next photo" [ref=e575] [cursor=pointer]:
                  - img [ref=e576]
              - link "$68,000,000 6 Beds · 9 Bath · 19,050 SF 4 E 79th Street SingleFamilyResidence · Manhattan 0 RLS · Listing Courtesy of Sothebys International Realty" [ref=e584] [cursor=pointer]:
                - /url: /listing/4-e-79th-street-new-york-city-ny-10075/rls20061488
                - paragraph [ref=e585]: $68,000,000
                - generic [ref=e586]:
                  - generic [ref=e587]: 6 Beds
                  - generic [ref=e588]: ·
                  - generic [ref=e589]: 9 Bath
                  - generic [ref=e590]: ·
                  - generic [ref=e591]: 19,050 SF
                - paragraph [ref=e592]: 4 E 79th Street
                - paragraph [ref=e593]: SingleFamilyResidence · Manhattan
                - text: "0"
                - paragraph [ref=e594]: RLS · Listing Courtesy of Sothebys International Realty
            - generic [ref=e596]:
              - generic [ref=e597]:
                - link "432 Park Avenue" [ref=e598] [cursor=pointer]:
                  - /url: /listing/432-park-avenue-apt-84b-new-york-city-ny-10022/rls20067618
                  - img "432 Park Avenue" [ref=e600]
                - button "Save to favorites" [ref=e602] [cursor=pointer]:
                  - img [ref=e603]
                - generic [ref=e605]: 1/6
                - button "Previous photo" [ref=e606] [cursor=pointer]:
                  - img [ref=e607]
                - button "Next photo" [ref=e609] [cursor=pointer]:
                  - img [ref=e610]
              - 'link "$67,000,000 3 Beds · 3.5 Bath · 5,421 SF 432 Park Avenue, 84B Condo · Manhattan CC: $23,156/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e618] [cursor=pointer]':
                - /url: /listing/432-park-avenue-apt-84b-new-york-city-ny-10022/rls20067618
                - paragraph [ref=e619]: $67,000,000
                - generic [ref=e620]:
                  - generic [ref=e621]: 3 Beds
                  - generic [ref=e622]: ·
                  - generic [ref=e623]: 3.5 Bath
                  - generic [ref=e624]: ·
                  - generic [ref=e625]: 5,421 SF
                - paragraph [ref=e626]: 432 Park Avenue, 84B
                - paragraph [ref=e627]: Condo · Manhattan
                - paragraph [ref=e628]: "CC: $23,156/mo"
                - paragraph [ref=e629]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - generic [ref=e631]:
              - generic [ref=e632]:
                - link "430 E 58th Street" [ref=e633] [cursor=pointer]:
                  - /url: /listing/430-e-58th-street-apt-ph80-new-york-city-ny-10022/rls11015411
                  - img "430 E 58th Street" [ref=e635]
                - button "Save to favorites" [ref=e637] [cursor=pointer]:
                  - img [ref=e638]
                - generic [ref=e640]: 1/48
                - generic "Video available" [ref=e642]:
                  - img [ref=e643]
                  - text: Video
                - button "Previous photo" [ref=e645] [cursor=pointer]:
                  - img [ref=e646]
                - button "Next photo" [ref=e648] [cursor=pointer]:
                  - img [ref=e649]
              - 'link "$65,000,000 5 Beds · 6.5 Bath · 9,191 SF 430 E 58th Street, PH80 Condo · Manhattan CC: $11,622/mo RLS · Listing Courtesy of Corcoran Sunshine Marketing Group" [ref=e657] [cursor=pointer]':
                - /url: /listing/430-e-58th-street-apt-ph80-new-york-city-ny-10022/rls11015411
                - paragraph [ref=e658]: $65,000,000
                - generic [ref=e659]:
                  - generic [ref=e660]: 5 Beds
                  - generic [ref=e661]: ·
                  - generic [ref=e662]: 6.5 Bath
                  - generic [ref=e663]: ·
                  - generic [ref=e664]: 9,191 SF
                - paragraph [ref=e665]: 430 E 58th Street, PH80
                - paragraph [ref=e666]: Condo · Manhattan
                - paragraph [ref=e667]: "CC: $11,622/mo"
                - paragraph [ref=e668]: RLS · Listing Courtesy of Corcoran Sunshine Marketing Group
            - generic [ref=e670]:
              - generic [ref=e671]:
                - link "53 W 53rd Street" [ref=e672] [cursor=pointer]:
                  - /url: /listing/53-w-53rd-street-apt-ph78-new-york-city-ny-10019/rls20005759
                  - img "53 W 53rd Street" [ref=e674]
                - button "Save to favorites" [ref=e676] [cursor=pointer]:
                  - img [ref=e677]
                - generic [ref=e679]: 1/15
                - button "Previous photo" [ref=e680] [cursor=pointer]:
                  - img [ref=e681]
                - button "Next photo" [ref=e683] [cursor=pointer]:
                  - img [ref=e684]
              - 'link "$64,730,000 4 Beds · 3.5 Bath · 7,455 SF 53 W 53rd Street, PH78 Condo · Manhattan CC: $24,019/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e692] [cursor=pointer]':
                - /url: /listing/53-w-53rd-street-apt-ph78-new-york-city-ny-10019/rls20005759
                - paragraph [ref=e693]: $64,730,000
                - generic [ref=e694]:
                  - generic [ref=e695]: 4 Beds
                  - generic [ref=e696]: ·
                  - generic [ref=e697]: 3.5 Bath
                  - generic [ref=e698]: ·
                  - generic [ref=e699]: 7,455 SF
                - paragraph [ref=e700]: 53 W 53rd Street, PH78
                - paragraph [ref=e701]: Condo · Manhattan
                - paragraph [ref=e702]: "CC: $24,019/mo"
                - paragraph [ref=e703]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - generic [ref=e705]:
              - generic [ref=e706]:
                - link "432 Park Avenue" [ref=e707] [cursor=pointer]:
                  - /url: /listing/432-park-avenue-apt-71-new-york-city-ny-10022/rls10932288
                  - img "432 Park Avenue" [ref=e709]
                - button "Save to favorites" [ref=e711] [cursor=pointer]:
                  - img [ref=e712]
                - generic [ref=e714]: 1/16
                - button "Previous photo" [ref=e715] [cursor=pointer]:
                  - img [ref=e716]
                - button "Next photo" [ref=e718] [cursor=pointer]:
                  - img [ref=e719]
              - 'link "$64,000,000 8 Beds · 8 Bath · 8,108 SF 432 Park Avenue, 71 Condo · Manhattan CC: $25,230/mo RLS · Listing Courtesy of Corcoran Group" [ref=e727] [cursor=pointer]':
                - /url: /listing/432-park-avenue-apt-71-new-york-city-ny-10022/rls10932288
                - paragraph [ref=e728]: $64,000,000
                - generic [ref=e729]:
                  - generic [ref=e730]: 8 Beds
                  - generic [ref=e731]: ·
                  - generic [ref=e732]: 8 Bath
                  - generic [ref=e733]: ·
                  - generic [ref=e734]: 8,108 SF
                - paragraph [ref=e735]: 432 Park Avenue, 71
                - paragraph [ref=e736]: Condo · Manhattan
                - paragraph [ref=e737]: "CC: $25,230/mo"
                - paragraph [ref=e738]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e740]:
              - generic [ref=e741]:
                - link "145 Hudson Street" [ref=e742] [cursor=pointer]:
                  - /url: /listing/145-hudson-street-apt-ph-new-york-city-ny-10013/rls20099412
                  - img "145 Hudson Street" [ref=e744]
                - button "Save to favorites" [ref=e746] [cursor=pointer]:
                  - img [ref=e747]
                - generic [ref=e749]: 1/27
                - button "Previous photo" [ref=e750] [cursor=pointer]:
                  - img [ref=e751]
                - button "Next photo" [ref=e753] [cursor=pointer]:
                  - img [ref=e754]
              - 'link "$59,500,000 4 Beds · 4.5 Bath · 7,493 SF 145 Hudson Street, PH Condo · Manhattan CC: $22,031/mo RLS · Listing Courtesy of Compass" [ref=e762] [cursor=pointer]':
                - /url: /listing/145-hudson-street-apt-ph-new-york-city-ny-10013/rls20099412
                - paragraph [ref=e763]: $59,500,000
                - generic [ref=e764]:
                  - generic [ref=e765]: 4 Beds
                  - generic [ref=e766]: ·
                  - generic [ref=e767]: 4.5 Bath
                  - generic [ref=e768]: ·
                  - generic [ref=e769]: 7,493 SF
                - paragraph [ref=e770]: 145 Hudson Street, PH
                - paragraph [ref=e771]: Condo · Manhattan
                - paragraph [ref=e772]: "CC: $22,031/mo"
                - paragraph [ref=e773]: RLS · Listing Courtesy of Compass
            - generic [ref=e775]:
              - generic [ref=e776]:
                - link "145 Hudson Street" [ref=e777] [cursor=pointer]:
                  - /url: /listing/145-hudson-street-apt-penthouse-new-york-city-ny-10013/rls20099408
                  - img "145 Hudson Street" [ref=e780]
                - button "Save to favorites" [ref=e782] [cursor=pointer]:
                  - img [ref=e783]
                - generic [ref=e785]: 1/27
                - button "Previous photo" [ref=e786] [cursor=pointer]:
                  - img [ref=e787]
                - button "Next photo" [ref=e789] [cursor=pointer]:
                  - img [ref=e790]
              - 'link "$59,500,000 4 Beds · 4.5 Bath · 7,500 SF 145 Hudson Street, Penthouse Condo · Manhattan CC: $19,420/mo RLS · Listing Courtesy of Modlin Group LLC" [ref=e798] [cursor=pointer]':
                - /url: /listing/145-hudson-street-apt-penthouse-new-york-city-ny-10013/rls20099408
                - paragraph [ref=e799]: $59,500,000
                - generic [ref=e800]:
                  - generic [ref=e801]: 4 Beds
                  - generic [ref=e802]: ·
                  - generic [ref=e803]: 4.5 Bath
                  - generic [ref=e804]: ·
                  - generic [ref=e805]: 7,500 SF
                - paragraph [ref=e806]: 145 Hudson Street, Penthouse
                - paragraph [ref=e807]: Condo · Manhattan
                - paragraph [ref=e808]: "CC: $19,420/mo"
                - paragraph [ref=e809]: RLS · Listing Courtesy of Modlin Group LLC
            - generic [ref=e811]:
              - generic [ref=e812]:
                - link "4 E 93rd Street" [ref=e813] [cursor=pointer]:
                  - /url: /listing/4-e-93rd-street-new-york-city-ny-10128/rls20094428
                  - img "4 E 93rd Street" [ref=e816]
                - button "Save to favorites" [ref=e818] [cursor=pointer]:
                  - img [ref=e819]
                - generic [ref=e821]: 1/16
                - button "Previous photo" [ref=e822] [cursor=pointer]:
                  - img [ref=e823]
                - button "Next photo" [ref=e825] [cursor=pointer]:
                  - img [ref=e826]
              - link "$56,000,000 10 Beds · 11.5 Bath · 12,120 SF 4 E 93rd Street Multi-Family · Manhattan RLS · Listing Courtesy of Corcoran Group" [ref=e834] [cursor=pointer]:
                - /url: /listing/4-e-93rd-street-new-york-city-ny-10128/rls20094428
                - paragraph [ref=e835]: $56,000,000
                - generic [ref=e836]:
                  - generic [ref=e837]: 10 Beds
                  - generic [ref=e838]: ·
                  - generic [ref=e839]: 11.5 Bath
                  - generic [ref=e840]: ·
                  - generic [ref=e841]: 12,120 SF
                - paragraph [ref=e842]: 4 E 93rd Street
                - paragraph [ref=e843]: Multi-Family · Manhattan
                - paragraph [ref=e844]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e846]:
              - generic [ref=e847]:
                - link "50 W 66th Street" [ref=e848] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-51e-new-york-city-ny-10023/rls20045299
                  - img "50 W 66th Street" [ref=e851]
                - button "Save to favorites" [ref=e853] [cursor=pointer]:
                  - img [ref=e854]
                - generic [ref=e856]: 1/32
                - button "Previous photo" [ref=e857] [cursor=pointer]:
                  - img [ref=e858]
                - button "Next photo" [ref=e860] [cursor=pointer]:
                  - img [ref=e861]
              - 'link "$54,000,000 5 Beds · 6 Bath · 6,942 SF 50 W 66th Street, 51E Condo · Manhattan CC: $11,483/mo RLS · Listing Courtesy of Corcoran Group" [ref=e869] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-51e-new-york-city-ny-10023/rls20045299
                - paragraph [ref=e870]: $54,000,000
                - generic [ref=e871]:
                  - generic [ref=e872]: 5 Beds
                  - generic [ref=e873]: ·
                  - generic [ref=e874]: 6 Bath
                  - generic [ref=e875]: ·
                  - generic [ref=e876]: 6,942 SF
                - paragraph [ref=e877]: 50 W 66th Street, 51E
                - paragraph [ref=e878]: Condo · Manhattan
                - paragraph [ref=e879]: "CC: $11,483/mo"
                - paragraph [ref=e880]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e882]:
              - generic [ref=e883]:
                - link "50 W 66th Street" [ref=e884] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-51e-new-york-city-ny-10023/rls11023827
                  - img "50 W 66th Street" [ref=e887]
                - button "Save to favorites" [ref=e889] [cursor=pointer]:
                  - img [ref=e890]
                - generic [ref=e892]: 1/44
                - button "Previous photo" [ref=e893] [cursor=pointer]:
                  - img [ref=e894]
                - button "Next photo" [ref=e896] [cursor=pointer]:
                  - img [ref=e897]
              - 'link "$54,000,000 5 Beds · 6 Bath · 6,942 SF 50 W 66th Street, 51E Condo · Manhattan CC: $11,483/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e905] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-51e-new-york-city-ny-10023/rls11023827
                - paragraph [ref=e906]: $54,000,000
                - generic [ref=e907]:
                  - generic [ref=e908]: 5 Beds
                  - generic [ref=e909]: ·
                  - generic [ref=e910]: 6 Bath
                  - generic [ref=e911]: ·
                  - generic [ref=e912]: 6,942 SF
                - paragraph [ref=e913]: 50 W 66th Street, 51E
                - paragraph [ref=e914]: Condo · Manhattan
                - paragraph [ref=e915]: "CC: $11,483/mo"
                - paragraph [ref=e916]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - generic [ref=e918]:
              - generic [ref=e919]:
                - link "50 W 66th Street" [ref=e920] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-51e-new-york-city-ny-10023/rls20061538
                  - img "50 W 66th Street" [ref=e923]
                - button "Save to favorites" [ref=e925] [cursor=pointer]:
                  - img [ref=e926]
                - generic [ref=e928]: 1/23
                - button "Previous photo" [ref=e929] [cursor=pointer]:
                  - img [ref=e930]
                - button "Next photo" [ref=e932] [cursor=pointer]:
                  - img [ref=e933]
              - 'link "$54,000,000 5 Beds · 6 Bath · 6,942 SF 50 W 66th Street, 51E Condo · Manhattan CC: $11,494/mo RLS · Listing Courtesy of Extell Marketing Group LLC" [ref=e941] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-51e-new-york-city-ny-10023/rls20061538
                - paragraph [ref=e942]: $54,000,000
                - generic [ref=e943]:
                  - generic [ref=e944]: 5 Beds
                  - generic [ref=e945]: ·
                  - generic [ref=e946]: 6 Bath
                  - generic [ref=e947]: ·
                  - generic [ref=e948]: 6,942 SF
                - paragraph [ref=e949]: 50 W 66th Street, 51E
                - paragraph [ref=e950]: Condo · Manhattan
                - paragraph [ref=e951]: "CC: $11,494/mo"
                - paragraph [ref=e952]: RLS · Listing Courtesy of Extell Marketing Group LLC
            - generic [ref=e954]:
              - generic [ref=e955]:
                - link "5 E 63rd Street" [ref=e956] [cursor=pointer]:
                  - /url: /listing/5-e-63rd-street-new-york-city-ny-10065/rls20099562
                  - img "5 E 63rd Street" [ref=e959]
                - button "Save to favorites" [ref=e961] [cursor=pointer]:
                  - img [ref=e962]
                - generic [ref=e964]: 1/31
                - button "Previous photo" [ref=e965] [cursor=pointer]:
                  - img [ref=e966]
                - button "Next photo" [ref=e968] [cursor=pointer]:
                  - img [ref=e969]
              - link "$52,000,000 8 Beds · 12 Bath · 16,138 SF 5 E 63rd Street SingleFamilyResidence · Manhattan RLS · Listing Courtesy of Serhant" [ref=e977] [cursor=pointer]:
                - /url: /listing/5-e-63rd-street-new-york-city-ny-10065/rls20099562
                - paragraph [ref=e978]: $52,000,000
                - generic [ref=e979]:
                  - generic [ref=e980]: 8 Beds
                  - generic [ref=e981]: ·
                  - generic [ref=e982]: 12 Bath
                  - generic [ref=e983]: ·
                  - generic [ref=e984]: 16,138 SF
                - paragraph [ref=e985]: 5 E 63rd Street
                - paragraph [ref=e986]: SingleFamilyResidence · Manhattan
                - paragraph [ref=e987]: RLS · Listing Courtesy of Serhant
            - generic [ref=e989]:
              - generic [ref=e990]:
                - link "70 W 45th Street" [ref=e991] [cursor=pointer]:
                  - /url: /listing/70-w-45th-street-apt-combo-new-york-city-ny-10036/rls20092482
                  - img "70 W 45th Street" [ref=e994]
                - button "Save to favorites" [ref=e996] [cursor=pointer]:
                  - img [ref=e997]
                - generic [ref=e999]: 1/15
                - button "Previous photo" [ref=e1000] [cursor=pointer]:
                  - img [ref=e1001]
                - button "Next photo" [ref=e1003] [cursor=pointer]:
                  - img [ref=e1004]
              - 'link "$50,000,000 10 Beds · 10 Bath · 8,300 SF 70 W 45th Street, COMBO Condo · Manhattan CC: $13,750/mo RLS · Listing Courtesy of Corcoran Group" [ref=e1012] [cursor=pointer]':
                - /url: /listing/70-w-45th-street-apt-combo-new-york-city-ny-10036/rls20092482
                - paragraph [ref=e1013]: $50,000,000
                - generic [ref=e1014]:
                  - generic [ref=e1015]: 10 Beds
                  - generic [ref=e1016]: ·
                  - generic [ref=e1017]: 10 Bath
                  - generic [ref=e1018]: ·
                  - generic [ref=e1019]: 8,300 SF
                - paragraph [ref=e1020]: 70 W 45th Street, COMBO
                - paragraph [ref=e1021]: Condo · Manhattan
                - paragraph [ref=e1022]: "CC: $13,750/mo"
                - paragraph [ref=e1023]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e1025]:
              - generic [ref=e1026]:
                - link "10-12 E 94th Street" [ref=e1027] [cursor=pointer]:
                  - /url: /listing/10-12-e-94th-street-new-york-city-ny-10128/rls20100278
                  - img "10-12 E 94th Street" [ref=e1030]
                - button "Save to favorites" [ref=e1032] [cursor=pointer]:
                  - img [ref=e1033]
                - generic [ref=e1035]: 1/30
                - button "Previous photo" [ref=e1036] [cursor=pointer]:
                  - img [ref=e1037]
                - button "Next photo" [ref=e1039] [cursor=pointer]:
                  - img [ref=e1040]
              - link "$50,000,000 5 Beds · 9.5 Bath · 15,235 SF 10-12 E 94th Street SingleFamilyResidence · Manhattan 0 RLS · Listing Courtesy of Compass" [ref=e1048] [cursor=pointer]:
                - /url: /listing/10-12-e-94th-street-new-york-city-ny-10128/rls20100278
                - paragraph [ref=e1049]: $50,000,000
                - generic [ref=e1050]:
                  - generic [ref=e1051]: 5 Beds
                  - generic [ref=e1052]: ·
                  - generic [ref=e1053]: 9.5 Bath
                  - generic [ref=e1054]: ·
                  - generic [ref=e1055]: 15,235 SF
                - paragraph [ref=e1056]: 10-12 E 94th Street
                - paragraph [ref=e1057]: SingleFamilyResidence · Manhattan
                - text: "0"
                - paragraph [ref=e1058]: RLS · Listing Courtesy of Compass
            - generic [ref=e1060]:
              - generic [ref=e1061]:
                - link "10-12 E 94th Street" [ref=e1062] [cursor=pointer]:
                  - /url: /listing/10-12-e-94th-street-new-york-city-ny-10128/rls20100262
                  - img "10-12 E 94th Street" [ref=e1065]
                - button "Save to favorites" [ref=e1067] [cursor=pointer]:
                  - img [ref=e1068]
                - generic [ref=e1070]: 1/30
                - button "Previous photo" [ref=e1071] [cursor=pointer]:
                  - img [ref=e1072]
                - button "Next photo" [ref=e1074] [cursor=pointer]:
                  - img [ref=e1075]
              - link "$50,000,000 5 Beds · 9.5 Bath · 15,235 SF 10-12 E 94th Street SingleFamilyResidence · Manhattan 0 RLS · Listing Courtesy of Modlin Group LLC" [ref=e1083] [cursor=pointer]:
                - /url: /listing/10-12-e-94th-street-new-york-city-ny-10128/rls20100262
                - paragraph [ref=e1084]: $50,000,000
                - generic [ref=e1085]:
                  - generic [ref=e1086]: 5 Beds
                  - generic [ref=e1087]: ·
                  - generic [ref=e1088]: 9.5 Bath
                  - generic [ref=e1089]: ·
                  - generic [ref=e1090]: 15,235 SF
                - paragraph [ref=e1091]: 10-12 E 94th Street
                - paragraph [ref=e1092]: SingleFamilyResidence · Manhattan
                - text: "0"
                - paragraph [ref=e1093]: RLS · Listing Courtesy of Modlin Group LLC
            - generic [ref=e1095]:
              - generic [ref=e1096]:
                - link "217 W 57th Street" [ref=e1097] [cursor=pointer]:
                  - /url: /listing/217-w-57th-street-apt-110-new-york-city-ny-10019/rls20077986
                  - img "217 W 57th Street" [ref=e1100]
                - button "Save to favorites" [ref=e1102] [cursor=pointer]:
                  - img [ref=e1103]
                - generic [ref=e1105]: 1/23
                - button "Previous photo" [ref=e1106] [cursor=pointer]:
                  - img [ref=e1107]
                - button "Next photo" [ref=e1109] [cursor=pointer]:
                  - img [ref=e1110]
              - 'link "$47,900,000 5 Beds · 5.5 Bath · 7,074 SF 217 W 57th Street, 110 Condo · Manhattan CC: $13,018/mo RLS · Listing Courtesy of Extell Marketing Group LLC" [ref=e1118] [cursor=pointer]':
                - /url: /listing/217-w-57th-street-apt-110-new-york-city-ny-10019/rls20077986
                - paragraph [ref=e1119]: $47,900,000
                - generic [ref=e1120]:
                  - generic [ref=e1121]: 5 Beds
                  - generic [ref=e1122]: ·
                  - generic [ref=e1123]: 5.5 Bath
                  - generic [ref=e1124]: ·
                  - generic [ref=e1125]: 7,074 SF
                - paragraph [ref=e1126]: 217 W 57th Street, 110
                - paragraph [ref=e1127]: Condo · Manhattan
                - paragraph [ref=e1128]: "CC: $13,018/mo"
                - paragraph [ref=e1129]: RLS · Listing Courtesy of Extell Marketing Group LLC
            - generic [ref=e1131]:
              - generic [ref=e1132]:
                - link "944 5th Avenue" [ref=e1133] [cursor=pointer]:
                  - /url: /listing/944-5th-avenue-apt-11flr-mais-new-york-city-ny-10021/rls20102858
                  - img "944 5th Avenue" [ref=e1136]
                - button "Save to favorites" [ref=e1138] [cursor=pointer]:
                  - img [ref=e1139]
                - generic [ref=e1141]: 1/43
                - button "Previous photo" [ref=e1142] [cursor=pointer]:
                  - img [ref=e1143]
                - button "Next photo" [ref=e1145] [cursor=pointer]:
                  - img [ref=e1146]
              - 'link "$47,500,000 4 Beds · 3.5 Bath 944 5th Avenue, 11FLR/MAIS Co-op · Manhattan Maint: $22,772/mo RLS · Listing Courtesy of Corcoran Group" [ref=e1154] [cursor=pointer]':
                - /url: /listing/944-5th-avenue-apt-11flr-mais-new-york-city-ny-10021/rls20102858
                - paragraph [ref=e1155]: $47,500,000
                - generic [ref=e1156]:
                  - generic [ref=e1157]: 4 Beds
                  - generic [ref=e1158]: ·
                  - generic [ref=e1159]: 3.5 Bath
                - paragraph [ref=e1160]: 944 5th Avenue, 11FLR/MAIS
                - paragraph [ref=e1161]: Co-op · Manhattan
                - paragraph [ref=e1162]: "Maint: $22,772/mo"
                - paragraph [ref=e1163]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e1165]:
              - generic [ref=e1166]:
                - link "432 Park Avenue" [ref=e1167] [cursor=pointer]:
                  - /url: /listing/432-park-avenue-apt-69-new-york-city-ny-10022/rls20054248
                  - img "432 Park Avenue" [ref=e1170]
                - button "Save to favorites" [ref=e1172] [cursor=pointer]:
                  - img [ref=e1173]
                - generic [ref=e1175]: 1/23
                - button "Previous photo" [ref=e1176] [cursor=pointer]:
                  - img [ref=e1177]
                - button "Next photo" [ref=e1179] [cursor=pointer]:
                  - img [ref=e1180]
              - 'link "$47,000,000 5 Beds · 7 Bath · 8,255 SF 432 Park Avenue, 69 Condo · Manhattan CC: $25,250/mo RLS · Listing Courtesy of Serhant" [ref=e1188] [cursor=pointer]':
                - /url: /listing/432-park-avenue-apt-69-new-york-city-ny-10022/rls20054248
                - paragraph [ref=e1189]: $47,000,000
                - generic [ref=e1190]:
                  - generic [ref=e1191]: 5 Beds
                  - generic [ref=e1192]: ·
                  - generic [ref=e1193]: 7 Bath
                  - generic [ref=e1194]: ·
                  - generic [ref=e1195]: 8,255 SF
                - paragraph [ref=e1196]: 432 Park Avenue, 69
                - paragraph [ref=e1197]: Condo · Manhattan
                - paragraph [ref=e1198]: "CC: $25,250/mo"
                - paragraph [ref=e1199]: RLS · Listing Courtesy of Serhant
            - generic [ref=e1201]:
              - generic [ref=e1202]:
                - link "111 W 57th Street" [ref=e1203] [cursor=pointer]:
                  - /url: /listing/111-w-57th-street-apt-ph80-new-york-city-ny-10019/rls20083926
                  - img "111 W 57th Street" [ref=e1206]
                - button "Save to favorites" [ref=e1208] [cursor=pointer]:
                  - img [ref=e1209]
                - generic [ref=e1211]: 1/20
                - generic "Video available" [ref=e1213]:
                  - img [ref=e1214]
                  - text: Video
                - button "Previous photo" [ref=e1216] [cursor=pointer]:
                  - img [ref=e1217]
                - button "Next photo" [ref=e1219] [cursor=pointer]:
                  - img [ref=e1220]
              - 'link "$46,000,000 3 Beds · 3.5 Bath · 5,984 SF 111 W 57th Street, PH80 Condo · Manhattan CC: $18,892/mo RLS · Listing Courtesy of Sothebys International Realty" [ref=e1228] [cursor=pointer]':
                - /url: /listing/111-w-57th-street-apt-ph80-new-york-city-ny-10019/rls20083926
                - paragraph [ref=e1229]: $46,000,000
                - generic [ref=e1230]:
                  - generic [ref=e1231]: 3 Beds
                  - generic [ref=e1232]: ·
                  - generic [ref=e1233]: 3.5 Bath
                  - generic [ref=e1234]: ·
                  - generic [ref=e1235]: 5,984 SF
                - paragraph [ref=e1236]: 111 W 57th Street, PH80
                - paragraph [ref=e1237]: Condo · Manhattan
                - paragraph [ref=e1238]: "CC: $18,892/mo"
                - paragraph [ref=e1239]: RLS · Listing Courtesy of Sothebys International Realty
            - generic [ref=e1241]:
              - generic [ref=e1242]:
                - link "1 Central Park S" [ref=e1243] [cursor=pointer]:
                  - /url: /listing/1-central-park-s-apt-1701-2-4-6-new-york-city-ny-10019/rls20100583
                  - img "1 Central Park S" [ref=e1246]
                - button "Save to favorites" [ref=e1248] [cursor=pointer]:
                  - img [ref=e1249]
                - generic [ref=e1251]: 1/18
                - generic "Video available" [ref=e1253]:
                  - img [ref=e1254]
                  - text: Video
                - button "Previous photo" [ref=e1256] [cursor=pointer]:
                  - img [ref=e1257]
                - button "Next photo" [ref=e1259] [cursor=pointer]:
                  - img [ref=e1260]
              - 'link "$45,000,000 4 Beds · 5.5 Bath · 6,000 SF 1 Central Park S, 1701/2/4/6 Condo · Manhattan CC: $10,540/mo RLS · Listing Courtesy of Serhant" [ref=e1268] [cursor=pointer]':
                - /url: /listing/1-central-park-s-apt-1701-2-4-6-new-york-city-ny-10019/rls20100583
                - paragraph [ref=e1269]: $45,000,000
                - generic [ref=e1270]:
                  - generic [ref=e1271]: 4 Beds
                  - generic [ref=e1272]: ·
                  - generic [ref=e1273]: 5.5 Bath
                  - generic [ref=e1274]: ·
                  - generic [ref=e1275]: 6,000 SF
                - paragraph [ref=e1276]: 1 Central Park S, 1701/2/4/6
                - paragraph [ref=e1277]: Condo · Manhattan
                - paragraph [ref=e1278]: "CC: $10,540/mo"
                - paragraph [ref=e1279]: RLS · Listing Courtesy of Serhant
            - generic [ref=e1281]:
              - generic [ref=e1282]:
                - link "15 Central Park W" [ref=e1283] [cursor=pointer]:
                  - /url: /listing/15-central-park-w-apt-16-17b-new-york-city-ny-10023/rls20086174
                  - img "15 Central Park W" [ref=e1286]
                - button "Save to favorites" [ref=e1288] [cursor=pointer]:
                  - img [ref=e1289]
                - generic [ref=e1291]: 1/19
                - button "Previous photo" [ref=e1292] [cursor=pointer]:
                  - img [ref=e1293]
                - button "Next photo" [ref=e1295] [cursor=pointer]:
                  - img [ref=e1296]
              - 'link "$45,000,000 4 Beds · 5 Bath · 5,417 SF 15 Central Park W, 16/17B Condo · Manhattan CC: $14,282/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e1304] [cursor=pointer]':
                - /url: /listing/15-central-park-w-apt-16-17b-new-york-city-ny-10023/rls20086174
                - paragraph [ref=e1305]: $45,000,000
                - generic [ref=e1306]:
                  - generic [ref=e1307]: 4 Beds
                  - generic [ref=e1308]: ·
                  - generic [ref=e1309]: 5 Bath
                  - generic [ref=e1310]: ·
                  - generic [ref=e1311]: 5,417 SF
                - paragraph [ref=e1312]: 15 Central Park W, 16/17B
                - paragraph [ref=e1313]: Condo · Manhattan
                - paragraph [ref=e1314]: "CC: $14,282/mo"
                - paragraph [ref=e1315]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - generic [ref=e1317]:
              - generic [ref=e1318]:
                - link "1 Central Park S" [ref=e1319] [cursor=pointer]:
                  - /url: /listing/1-central-park-s-apt-ph2003-09-new-york-city-ny-10019/rls20097157
                  - img "1 Central Park S" [ref=e1322]
                - button "Save to favorites" [ref=e1324] [cursor=pointer]:
                  - img [ref=e1325]
                - generic [ref=e1327]: 1/22
                - button "Previous photo" [ref=e1328] [cursor=pointer]:
                  - img [ref=e1329]
                - button "Next photo" [ref=e1331] [cursor=pointer]:
                  - img [ref=e1332]
              - 'link "$45,000,000 7 Beds · 9 Bath · 10,290 SF 1 Central Park S, PH2003/09 Condo · Manhattan CC: $18,069/mo RLS · Listing Courtesy of Corcoran Group" [ref=e1340] [cursor=pointer]':
                - /url: /listing/1-central-park-s-apt-ph2003-09-new-york-city-ny-10019/rls20097157
                - paragraph [ref=e1341]: $45,000,000
                - generic [ref=e1342]:
                  - generic [ref=e1343]: 7 Beds
                  - generic [ref=e1344]: ·
                  - generic [ref=e1345]: 9 Bath
                  - generic [ref=e1346]: ·
                  - generic [ref=e1347]: 10,290 SF
                - paragraph [ref=e1348]: 1 Central Park S, PH2003/09
                - paragraph [ref=e1349]: Condo · Manhattan
                - paragraph [ref=e1350]: "CC: $18,069/mo"
                - paragraph [ref=e1351]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e1353]:
              - generic [ref=e1354]:
                - link "555 W 22nd Street" [ref=e1355] [cursor=pointer]:
                  - /url: /listing/555-w-22nd-street-apt-ph23-new-york-city-ny-10011/rls20088543
                  - img "555 W 22nd Street" [ref=e1358]
                - button "Save to favorites" [ref=e1360] [cursor=pointer]:
                  - img [ref=e1361]
                - generic [ref=e1363]: 1/15
                - button "Previous photo" [ref=e1364] [cursor=pointer]:
                  - img [ref=e1365]
                - button "Next photo" [ref=e1367] [cursor=pointer]:
                  - img [ref=e1368]
              - 'link "$44,950,000 4 Beds · 4.5 Bath · 6,267 SF 555 W 22nd Street, PH23 Condo · Manhattan CC: $13,919/mo RLS · Listing Courtesy of Corcoran Sunshine Marketing Group" [ref=e1376] [cursor=pointer]':
                - /url: /listing/555-w-22nd-street-apt-ph23-new-york-city-ny-10011/rls20088543
                - paragraph [ref=e1377]: $44,950,000
                - generic [ref=e1378]:
                  - generic [ref=e1379]: 4 Beds
                  - generic [ref=e1380]: ·
                  - generic [ref=e1381]: 4.5 Bath
                  - generic [ref=e1382]: ·
                  - generic [ref=e1383]: 6,267 SF
                - paragraph [ref=e1384]: 555 W 22nd Street, PH23
                - paragraph [ref=e1385]: Condo · Manhattan
                - paragraph [ref=e1386]: "CC: $13,919/mo"
                - paragraph [ref=e1387]: RLS · Listing Courtesy of Corcoran Sunshine Marketing Group
            - generic [ref=e1389]:
              - generic [ref=e1390]:
                - link "329-339 E 94th Street" [ref=e1391] [cursor=pointer]:
                  - /url: /listing/329-339-e-94th-street-new-york-city-ny-10128/rls20104664
                  - img "329-339 E 94th Street" [ref=e1394]
                - button "Save to favorites" [ref=e1396] [cursor=pointer]:
                  - img [ref=e1397]
                - generic [ref=e1399]: 1/9
                - button "Previous photo" [ref=e1400] [cursor=pointer]:
                  - img [ref=e1401]
                - button "Next photo" [ref=e1403] [cursor=pointer]:
                  - img [ref=e1404]
              - 'link "$43,500,000 20 Beds · 20 Bath · 78,000 SF 329-339 E 94th Street Multi-Family · Manhattan CC: $5,833.33/mo RLS · Listing Courtesy of Compass" [ref=e1412] [cursor=pointer]':
                - /url: /listing/329-339-e-94th-street-new-york-city-ny-10128/rls20104664
                - paragraph [ref=e1413]: $43,500,000
                - generic [ref=e1414]:
                  - generic [ref=e1415]: 20 Beds
                  - generic [ref=e1416]: ·
                  - generic [ref=e1417]: 20 Bath
                  - generic [ref=e1418]: ·
                  - generic [ref=e1419]: 78,000 SF
                - paragraph [ref=e1420]: 329-339 E 94th Street
                - paragraph [ref=e1421]: Multi-Family · Manhattan
                - paragraph [ref=e1422]: "CC: $5,833.33/mo"
                - paragraph [ref=e1423]: RLS · Listing Courtesy of Compass
            - generic [ref=e1425]:
              - generic [ref=e1426]:
                - link "212 W 18th Street" [ref=e1427] [cursor=pointer]:
                  - /url: /listing/212-w-18th-street-apt-penthouse2-new-york-city-ny-10011/rls11026317
                  - img "212 W 18th Street" [ref=e1430]
                - button "Save to favorites" [ref=e1432] [cursor=pointer]:
                  - img [ref=e1433]
                - generic [ref=e1435]: 1/50
                - generic "3D tour available" [ref=e1437]:
                  - img [ref=e1438]
                  - text: 3D Tour
                - button "Previous photo" [ref=e1440] [cursor=pointer]:
                  - img [ref=e1441]
                - button "Next photo" [ref=e1443] [cursor=pointer]:
                  - img [ref=e1444]
              - 'link "$42,500,000 5 Beds · 5.5 Bath · 6,783 SF 212 W 18th Street, Penthouse2 Condo · Manhattan CC: $10,654/mo RLS · Listing Courtesy of DGSIR Realty" [ref=e1452] [cursor=pointer]':
                - /url: /listing/212-w-18th-street-apt-penthouse2-new-york-city-ny-10011/rls11026317
                - paragraph [ref=e1453]: $42,500,000
                - generic [ref=e1454]:
                  - generic [ref=e1455]: 5 Beds
                  - generic [ref=e1456]: ·
                  - generic [ref=e1457]: 5.5 Bath
                  - generic [ref=e1458]: ·
                  - generic [ref=e1459]: 6,783 SF
                - paragraph [ref=e1460]: 212 W 18th Street, Penthouse2
                - paragraph [ref=e1461]: Condo · Manhattan
                - paragraph [ref=e1462]: "CC: $10,654/mo"
                - paragraph [ref=e1463]: RLS · Listing Courtesy of DGSIR Realty
            - generic [ref=e1465]:
              - generic [ref=e1466]:
                - link "111 W 57th Street" [ref=e1467] [cursor=pointer]:
                  - /url: /listing/111-w-57th-street-apt-ph80-new-york-city-ny-10019/rls20090192
                  - img "111 W 57th Street" [ref=e1470]
                - button "Save to favorites" [ref=e1472] [cursor=pointer]:
                  - img [ref=e1473]
                - generic [ref=e1475]: 1/19
                - button "Previous photo" [ref=e1476] [cursor=pointer]:
                  - img [ref=e1477]
                - button "Next photo" [ref=e1479] [cursor=pointer]:
                  - img [ref=e1480]
              - 'link "$42,500,000 3 Beds · 3.5 Bath · 5,894 SF 111 W 57th Street, PH80 Condo · Manhattan CC: $18,892.49/mo RLS · Listing Courtesy of Modlin Group LLC" [ref=e1488] [cursor=pointer]':
                - /url: /listing/111-w-57th-street-apt-ph80-new-york-city-ny-10019/rls20090192
                - paragraph [ref=e1489]: $42,500,000
                - generic [ref=e1490]:
                  - generic [ref=e1491]: 3 Beds
                  - generic [ref=e1492]: ·
                  - generic [ref=e1493]: 3.5 Bath
                  - generic [ref=e1494]: ·
                  - generic [ref=e1495]: 5,894 SF
                - paragraph [ref=e1496]: 111 W 57th Street, PH80
                - paragraph [ref=e1497]: Condo · Manhattan
                - paragraph [ref=e1498]: "CC: $18,892.49/mo"
                - paragraph [ref=e1499]: RLS · Listing Courtesy of Modlin Group LLC
            - generic [ref=e1501]:
              - generic [ref=e1502]:
                - link "1122 Madison Avenue" [ref=e1503] [cursor=pointer]:
                  - /url: /listing/1122-madison-avenue-apt-floor19-new-york-city-ny-10028/rls20102908
                  - img "1122 Madison Avenue" [ref=e1506]
                - button "Save to favorites" [ref=e1508] [cursor=pointer]:
                  - img [ref=e1509]
                - generic [ref=e1511]: 1/20
                - button "Previous photo" [ref=e1512] [cursor=pointer]:
                  - img [ref=e1513]
                - button "Next photo" [ref=e1515] [cursor=pointer]:
                  - img [ref=e1516]
              - 'link "$40,500,000 5 Beds · 5.5 Bath · 5,251 SF 1122 Madison Avenue, FLOOR19 Condo · Manhattan CC: $11,941/mo RLS · Listing Courtesy of Corcoran Sunshine Marketing Group" [ref=e1524] [cursor=pointer]':
                - /url: /listing/1122-madison-avenue-apt-floor19-new-york-city-ny-10028/rls20102908
                - paragraph [ref=e1525]: $40,500,000
                - generic [ref=e1526]:
                  - generic [ref=e1527]: 5 Beds
                  - generic [ref=e1528]: ·
                  - generic [ref=e1529]: 5.5 Bath
                  - generic [ref=e1530]: ·
                  - generic [ref=e1531]: 5,251 SF
                - paragraph [ref=e1532]: 1122 Madison Avenue, FLOOR19
                - paragraph [ref=e1533]: Condo · Manhattan
                - paragraph [ref=e1534]: "CC: $11,941/mo"
                - paragraph [ref=e1535]: RLS · Listing Courtesy of Corcoran Sunshine Marketing Group
            - generic [ref=e1537]:
              - generic [ref=e1538]:
                - link "520 Park Avenue" [ref=e1539] [cursor=pointer]:
                  - /url: /listing/520-park-avenue-apt-ph59-new-york-city-ny-10065/rls20068387
                  - img "520 Park Avenue" [ref=e1542]
                - button "Save to favorites" [ref=e1544] [cursor=pointer]:
                  - img [ref=e1545]
                - generic [ref=e1547]: 1/11
                - generic "Video available" [ref=e1549]:
                  - img [ref=e1550]
                  - text: Video
                - button "Previous photo" [ref=e1552] [cursor=pointer]:
                  - img [ref=e1553]
                - button "Next photo" [ref=e1555] [cursor=pointer]:
                  - img [ref=e1556]
              - 'link "$40,000,000 3 Beds · 3.5 Bath · 4,322 SF 520 Park Avenue, PH59 Condo · Manhattan CC: $9,917.25/mo RLS · Listing Courtesy of Compass" [ref=e1564] [cursor=pointer]':
                - /url: /listing/520-park-avenue-apt-ph59-new-york-city-ny-10065/rls20068387
                - paragraph [ref=e1565]: $40,000,000
                - generic [ref=e1566]:
                  - generic [ref=e1567]: 3 Beds
                  - generic [ref=e1568]: ·
                  - generic [ref=e1569]: 3.5 Bath
                  - generic [ref=e1570]: ·
                  - generic [ref=e1571]: 4,322 SF
                - paragraph [ref=e1572]: 520 Park Avenue, PH59
                - paragraph [ref=e1573]: Condo · Manhattan
                - paragraph [ref=e1574]: "CC: $9,917.25/mo"
                - paragraph [ref=e1575]: RLS · Listing Courtesy of Compass
            - generic [ref=e1577]:
              - generic [ref=e1578]:
                - link "117 E 70th Street" [ref=e1579] [cursor=pointer]:
                  - /url: /listing/117-e-70th-street-new-york-city-ny-10021/rls20075875
                  - img "117 E 70th Street" [ref=e1582]
                - button "Save to favorites" [ref=e1584] [cursor=pointer]:
                  - img [ref=e1585]
                - generic [ref=e1587]: 1/27
                - button "Previous photo" [ref=e1588] [cursor=pointer]:
                  - img [ref=e1589]
                - button "Next photo" [ref=e1591] [cursor=pointer]:
                  - img [ref=e1592]
              - link "$40,000,000 19 Beds · 9 Bath 117 E 70th Street SingleFamilyResidence · Manhattan RLS · Listing Courtesy of Brown Harris Stevens Residential Sales LLC" [ref=e1600] [cursor=pointer]:
                - /url: /listing/117-e-70th-street-new-york-city-ny-10021/rls20075875
                - paragraph [ref=e1601]: $40,000,000
                - generic [ref=e1602]:
                  - generic [ref=e1603]: 19 Beds
                  - generic [ref=e1604]: ·
                  - generic [ref=e1605]: 9 Bath
                - paragraph [ref=e1606]: 117 E 70th Street
                - paragraph [ref=e1607]: SingleFamilyResidence · Manhattan
                - paragraph [ref=e1608]: RLS · Listing Courtesy of Brown Harris Stevens Residential Sales LLC
            - generic [ref=e1610]:
              - generic [ref=e1611]:
                - link "111 W 57th Street" [ref=e1612] [cursor=pointer]:
                  - /url: /listing/111-w-57th-street-apt-ph82-new-york-city-ny-10019/rls20090193
                  - img "111 W 57th Street" [ref=e1615]
                - button "Save to favorites" [ref=e1617] [cursor=pointer]:
                  - img [ref=e1618]
                - generic [ref=e1620]: 1/19
                - button "Previous photo" [ref=e1621] [cursor=pointer]:
                  - img [ref=e1622]
                - button "Next photo" [ref=e1624] [cursor=pointer]:
                  - img [ref=e1625]
              - 'link "$40,000,000 2 Beds · 2.5 Bath · 5,586 SF 111 W 57th Street, PH82 Condo · Manhattan CC: $18,054.63/mo RLS · Listing Courtesy of Modlin Group LLC" [ref=e1633] [cursor=pointer]':
                - /url: /listing/111-w-57th-street-apt-ph82-new-york-city-ny-10019/rls20090193
                - paragraph [ref=e1634]: $40,000,000
                - generic [ref=e1635]:
                  - generic [ref=e1636]: 2 Beds
                  - generic [ref=e1637]: ·
                  - generic [ref=e1638]: 2.5 Bath
                  - generic [ref=e1639]: ·
                  - generic [ref=e1640]: 5,586 SF
                - paragraph [ref=e1641]: 111 W 57th Street, PH82
                - paragraph [ref=e1642]: Condo · Manhattan
                - paragraph [ref=e1643]: "CC: $18,054.63/mo"
                - paragraph [ref=e1644]: RLS · Listing Courtesy of Modlin Group LLC
            - generic [ref=e1646]:
              - generic [ref=e1647]:
                - link "175 5th Avenue" [ref=e1648] [cursor=pointer]:
                  - /url: /listing/175-5th-avenue-apt-floor17-new-york-city-ny-10010/rls20104592
                  - img "175 5th Avenue" [ref=e1651]
                - button "Save to favorites" [ref=e1653] [cursor=pointer]:
                  - img [ref=e1654]
                - generic [ref=e1656]: 1/14
                - button "Previous photo" [ref=e1657] [cursor=pointer]:
                  - img [ref=e1658]
                - button "Next photo" [ref=e1660] [cursor=pointer]:
                  - img [ref=e1661]
              - 'link "$39,750,000 6 Beds · 7.5 Bath · 7,657 SF 175 5th Avenue, FLOOR17 Condo · Manhattan CC: $14,507/mo RLS · Listing Courtesy of Corcoran Sunshine Marketing Group" [ref=e1669] [cursor=pointer]':
                - /url: /listing/175-5th-avenue-apt-floor17-new-york-city-ny-10010/rls20104592
                - paragraph [ref=e1670]: $39,750,000
                - generic [ref=e1671]:
                  - generic [ref=e1672]: 6 Beds
                  - generic [ref=e1673]: ·
                  - generic [ref=e1674]: 7.5 Bath
                  - generic [ref=e1675]: ·
                  - generic [ref=e1676]: 7,657 SF
                - paragraph [ref=e1677]: 175 5th Avenue, FLOOR17
                - paragraph [ref=e1678]: Condo · Manhattan
                - paragraph [ref=e1679]: "CC: $14,507/mo"
                - paragraph [ref=e1680]: RLS · Listing Courtesy of Corcoran Sunshine Marketing Group
            - generic [ref=e1682]:
              - generic [ref=e1683]:
                - link "1122 Madison Avenue" [ref=e1684] [cursor=pointer]:
                  - /url: /listing/1122-madison-avenue-apt-floor15-new-york-city-ny-10028/rls20090112
                  - img "1122 Madison Avenue" [ref=e1687]
                - button "Save to favorites" [ref=e1689] [cursor=pointer]:
                  - img [ref=e1690]
                - generic [ref=e1692]: 1/20
                - button "Previous photo" [ref=e1693] [cursor=pointer]:
                  - img [ref=e1694]
                - button "Next photo" [ref=e1696] [cursor=pointer]:
                  - img [ref=e1697]
              - 'link "$38,950,000 5 Beds · 5.5 Bath · 5,251 SF 1122 Madison Avenue, FLOOR15 Condo · Manhattan CC: $12,437/mo RLS · Listing Courtesy of Corcoran Sunshine Marketing Group" [ref=e1705] [cursor=pointer]':
                - /url: /listing/1122-madison-avenue-apt-floor15-new-york-city-ny-10028/rls20090112
                - paragraph [ref=e1706]: $38,950,000
                - generic [ref=e1707]:
                  - generic [ref=e1708]: 5 Beds
                  - generic [ref=e1709]: ·
                  - generic [ref=e1710]: 5.5 Bath
                  - generic [ref=e1711]: ·
                  - generic [ref=e1712]: 5,251 SF
                - paragraph [ref=e1713]: 1122 Madison Avenue, FLOOR15
                - paragraph [ref=e1714]: Condo · Manhattan
                - paragraph [ref=e1715]: "CC: $12,437/mo"
                - paragraph [ref=e1716]: RLS · Listing Courtesy of Corcoran Sunshine Marketing Group
            - generic [ref=e1718]:
              - generic [ref=e1719]:
                - link "50 W 66th Street" [ref=e1720] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-56s-new-york-city-ny-10023/rls20073502
                  - img "50 W 66th Street" [ref=e1723]
                - button "Save to favorites" [ref=e1725] [cursor=pointer]:
                  - img [ref=e1726]
                - generic [ref=e1728]: 1/38
                - button "Previous photo" [ref=e1729] [cursor=pointer]:
                  - img [ref=e1730]
                - button "Next photo" [ref=e1732] [cursor=pointer]:
                  - img [ref=e1733]
              - 'link "$37,500,000 5 Beds · 6.5 Bath · 4,982 SF 50 W 66th Street, 56S Condo · Manhattan CC: $8,204/mo RLS · Listing Courtesy of Extell Marketing Group LLC" [ref=e1741] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-56s-new-york-city-ny-10023/rls20073502
                - paragraph [ref=e1742]: $37,500,000
                - generic [ref=e1743]:
                  - generic [ref=e1744]: 5 Beds
                  - generic [ref=e1745]: ·
                  - generic [ref=e1746]: 6.5 Bath
                  - generic [ref=e1747]: ·
                  - generic [ref=e1748]: 4,982 SF
                - paragraph [ref=e1749]: 50 W 66th Street, 56S
                - paragraph [ref=e1750]: Condo · Manhattan
                - paragraph [ref=e1751]: "CC: $8,204/mo"
                - paragraph [ref=e1752]: RLS · Listing Courtesy of Extell Marketing Group LLC
            - generic [ref=e1754]:
              - generic [ref=e1755]:
                - link "50 W 66th Street" [ref=e1756] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-56s-new-york-city-ny-10023/rls20075093
                  - img "50 W 66th Street" [ref=e1759]
                - button "Save to favorites" [ref=e1761] [cursor=pointer]:
                  - img [ref=e1762]
                - generic [ref=e1764]: 1/34
                - button "Previous photo" [ref=e1765] [cursor=pointer]:
                  - img [ref=e1766]
                - button "Next photo" [ref=e1768] [cursor=pointer]:
                  - img [ref=e1769]
              - 'link "$37,500,000 5 Beds · 6.5 Bath · 4,982 SF 50 W 66th Street, 56S Condo · Manhattan CC: $8,106/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e1777] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-56s-new-york-city-ny-10023/rls20075093
                - paragraph [ref=e1778]: $37,500,000
                - generic [ref=e1779]:
                  - generic [ref=e1780]: 5 Beds
                  - generic [ref=e1781]: ·
                  - generic [ref=e1782]: 6.5 Bath
                  - generic [ref=e1783]: ·
                  - generic [ref=e1784]: 4,982 SF
                - paragraph [ref=e1785]: 50 W 66th Street, 56S
                - paragraph [ref=e1786]: Condo · Manhattan
                - paragraph [ref=e1787]: "CC: $8,106/mo"
                - paragraph [ref=e1788]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - generic [ref=e1790]:
              - generic [ref=e1791]:
                - link "50 W 66th Street" [ref=e1792] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-56s-new-york-city-ny-10023/rls20073524
                  - img "50 W 66th Street" [ref=e1795]
                - button "Save to favorites" [ref=e1797] [cursor=pointer]:
                  - img [ref=e1798]
                - generic [ref=e1800]: 1/49
                - button "Previous photo" [ref=e1801] [cursor=pointer]:
                  - img [ref=e1802]
                - button "Next photo" [ref=e1804] [cursor=pointer]:
                  - img [ref=e1805]
              - 'link "$37,500,000 5 Beds · 6.5 Bath · 4,982 SF 50 W 66th Street, 56S Condo · Manhattan CC: $8,197/mo RLS · Listing Courtesy of Corcoran Group" [ref=e1813] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-56s-new-york-city-ny-10023/rls20073524
                - paragraph [ref=e1814]: $37,500,000
                - generic [ref=e1815]:
                  - generic [ref=e1816]: 5 Beds
                  - generic [ref=e1817]: ·
                  - generic [ref=e1818]: 6.5 Bath
                  - generic [ref=e1819]: ·
                  - generic [ref=e1820]: 4,982 SF
                - paragraph [ref=e1821]: 50 W 66th Street, 56S
                - paragraph [ref=e1822]: Condo · Manhattan
                - paragraph [ref=e1823]: "CC: $8,197/mo"
                - paragraph [ref=e1824]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e1826]:
              - generic [ref=e1827]:
                - link "255 E 77th Street" [ref=e1828] [cursor=pointer]:
                  - /url: /listing/255-e-77th-street-apt-phduplex-new-york-city-ny-10075/rls20075949
                  - img "255 E 77th Street" [ref=e1831]
                - button "Save to favorites" [ref=e1833] [cursor=pointer]:
                  - img [ref=e1834]
                - generic [ref=e1836]: 1/26
                - generic "Video available" [ref=e1838]:
                  - img [ref=e1839]
                  - text: Video
                - button "Previous photo" [ref=e1841] [cursor=pointer]:
                  - img [ref=e1842]
                - button "Next photo" [ref=e1844] [cursor=pointer]:
                  - img [ref=e1845]
              - 'link "$37,500,000 7 Beds · 6.5 Bath · 7,206 SF 255 E 77th Street, PHDUPLEX Condo · Manhattan CC: $8,793/mo RLS · Listing Courtesy of Compass" [ref=e1853] [cursor=pointer]':
                - /url: /listing/255-e-77th-street-apt-phduplex-new-york-city-ny-10075/rls20075949
                - paragraph [ref=e1854]: $37,500,000
                - generic [ref=e1855]:
                  - generic [ref=e1856]: 7 Beds
                  - generic [ref=e1857]: ·
                  - generic [ref=e1858]: 6.5 Bath
                  - generic [ref=e1859]: ·
                  - generic [ref=e1860]: 7,206 SF
                - paragraph [ref=e1861]: 255 E 77th Street, PHDUPLEX
                - paragraph [ref=e1862]: Condo · Manhattan
                - paragraph [ref=e1863]: "CC: $8,793/mo"
                - paragraph [ref=e1864]: RLS · Listing Courtesy of Compass
            - generic [ref=e1866]:
              - generic [ref=e1867]:
                - link "50 W 66th Street" [ref=e1868] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-58n-new-york-city-ny-10023/rls20085440
                  - img "50 W 66th Street" [ref=e1871]
                - button "Save to favorites" [ref=e1873] [cursor=pointer]:
                  - img [ref=e1874]
                - generic [ref=e1876]: 1/49
                - button "Previous photo" [ref=e1877] [cursor=pointer]:
                  - img [ref=e1878]
                - button "Next photo" [ref=e1880] [cursor=pointer]:
                  - img [ref=e1881]
              - 'link "$36,500,000 4 Beds · 5 Bath · 4,878 SF 50 W 66th Street, 58N Condo · Manhattan CC: $8,199/mo RLS · Listing Courtesy of Corcoran Group" [ref=e1889] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-58n-new-york-city-ny-10023/rls20085440
                - paragraph [ref=e1890]: $36,500,000
                - generic [ref=e1891]:
                  - generic [ref=e1892]: 4 Beds
                  - generic [ref=e1893]: ·
                  - generic [ref=e1894]: 5 Bath
                  - generic [ref=e1895]: ·
                  - generic [ref=e1896]: 4,878 SF
                - paragraph [ref=e1897]: 50 W 66th Street, 58N
                - paragraph [ref=e1898]: Condo · Manhattan
                - paragraph [ref=e1899]: "CC: $8,199/mo"
                - paragraph [ref=e1900]: RLS · Listing Courtesy of Corcoran Group
            - generic [ref=e1902]:
              - generic [ref=e1903]:
                - link "50 W 66th Street" [ref=e1904] [cursor=pointer]:
                  - /url: /listing/50-w-66th-street-apt-58n-new-york-city-ny-10023/rls20086851
                  - img "50 W 66th Street" [ref=e1907]
                - button "Save to favorites" [ref=e1909] [cursor=pointer]:
                  - img [ref=e1910]
                - generic [ref=e1912]: 1/24
                - button "Previous photo" [ref=e1913] [cursor=pointer]:
                  - img [ref=e1914]
                - button "Next photo" [ref=e1916] [cursor=pointer]:
                  - img [ref=e1917]
              - 'link "$36,500,000 4 Beds · 5 Bath · 4,878 SF 50 W 66th Street, 58N Condo · Manhattan CC: $8,199/mo RLS · Listing Courtesy of Douglas Elliman Real Estate" [ref=e1925] [cursor=pointer]':
                - /url: /listing/50-w-66th-street-apt-58n-new-york-city-ny-10023/rls20086851
                - paragraph [ref=e1926]: $36,500,000
                - generic [ref=e1927]:
                  - generic [ref=e1928]: 4 Beds
                  - generic [ref=e1929]: ·
                  - generic [ref=e1930]: 5 Bath
                  - generic [ref=e1931]: ·
                  - generic [ref=e1932]: 4,878 SF
                - paragraph [ref=e1933]: 50 W 66th Street, 58N
                - paragraph [ref=e1934]: Condo · Manhattan
                - paragraph [ref=e1935]: "CC: $8,199/mo"
                - paragraph [ref=e1936]: RLS · Listing Courtesy of Douglas Elliman Real Estate
            - button "Load More" [ref=e1938] [cursor=pointer]
            - generic [ref=e1939]:
              - paragraph [ref=e1940]:
                - text: Listing data provided by REBNY RLS. Updated continuously.
                - img "Equal Housing Opportunity" [ref=e1941]
              - paragraph [ref=e1944]: Based on information from the REBNY Listing Service. Information deemed reliable but not guaranteed.
              - paragraph [ref=e1945]: Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State.
              - paragraph [ref=e1946]: Commission rates are not set by law and are fully negotiable.
          - generic [ref=e1948]:
            - generic [ref=e1949]:
              - button "Bright map style" [ref=e1950] [cursor=pointer]:
                - img [ref=e1951]
              - button "Liberty map style" [ref=e1954] [cursor=pointer]:
                - img [ref=e1955]
              - button "Positron map style" [ref=e1958] [cursor=pointer]:
                - img [ref=e1959]
            - generic [ref=e1961]:
              - generic:
                - generic [ref=e1963]:
                  - generic:
                    - region "Map"
                - generic:
                  - button "$128.0M 2":
                    - generic [ref=e1964] [cursor=pointer]:
                      - text: $128.0M
                      - generic [ref=e1965]: "2"
                  - button "$90.0M 5":
                    - generic [ref=e1966] [cursor=pointer]:
                      - text: $90.0M
                      - generic [ref=e1967]: "5"
                  - button "$90.0M":
                    - generic [ref=e1968] [cursor=pointer]: $90.0M
                  - button "$88.5M 5":
                    - generic [ref=e1969] [cursor=pointer]:
                      - text: $88.5M
                      - generic [ref=e1970]: "5"
                  - button "$85.0M":
                    - generic [ref=e1971] [cursor=pointer]: $85.0M
                  - button "$85.0M 11":
                    - generic [ref=e1972] [cursor=pointer]:
                      - text: $85.0M
                      - generic [ref=e1973]: "11"
                  - button "$85.0M 11":
                    - generic [ref=e1974] [cursor=pointer]:
                      - text: $85.0M
                      - generic [ref=e1975]: "11"
                  - button "$85.0M 11":
                    - generic [ref=e1976] [cursor=pointer]:
                      - text: $85.0M
                      - generic [ref=e1977]: "11"
                  - button "$80.0M":
                    - generic [ref=e1978] [cursor=pointer]: $80.0M
                  - button "$79.9M":
                    - generic [ref=e1979] [cursor=pointer]: $79.9M
                  - button "$70.0M 2":
                    - generic [ref=e1980] [cursor=pointer]:
                      - text: $70.0M
                      - generic [ref=e1981]: "2"
                  - button "$70.0M 2":
                    - generic [ref=e1982] [cursor=pointer]:
                      - text: $70.0M
                      - generic [ref=e1983]: "2"
                  - button "$68.0M":
                    - generic [ref=e1984] [cursor=pointer]: $68.0M
                  - button "$67.0M 5":
                    - generic [ref=e1985] [cursor=pointer]:
                      - text: $67.0M
                      - generic [ref=e1986]: "5"
                  - button "$65.0M":
                    - generic [ref=e1987] [cursor=pointer]: $65.0M
                  - button "$64.7M":
                    - generic [ref=e1988] [cursor=pointer]: $64.7M
                  - button "$64.0M 5":
                    - generic [ref=e1989] [cursor=pointer]:
                      - text: $64.0M
                      - generic [ref=e1990]: "5"
                  - button "$59.5M 2":
                    - generic [ref=e1991] [cursor=pointer]:
                      - text: $59.5M
                      - generic [ref=e1992]: "2"
                  - button "$59.5M 2":
                    - generic [ref=e1993] [cursor=pointer]:
                      - text: $59.5M
                      - generic [ref=e1994]: "2"
                  - button "$56.0M":
                    - generic [ref=e1995] [cursor=pointer]: $56.0M
                  - button "$54.0M 11":
                    - generic [ref=e1996] [cursor=pointer]:
                      - text: $54.0M
                      - generic [ref=e1997]: "11"
                  - button "$54.0M 11":
                    - generic [ref=e1998] [cursor=pointer]:
                      - text: $54.0M
                      - generic [ref=e1999]: "11"
                  - button "$54.0M 11":
                    - generic [ref=e2000] [cursor=pointer]:
                      - text: $54.0M
                      - generic [ref=e2001]: "11"
                  - button "$52.0M":
                    - generic [ref=e2002] [cursor=pointer]: $52.0M
                  - button "$50.0M":
                    - generic [ref=e2003] [cursor=pointer]: $50.0M
                  - button "$50.0M 2":
                    - generic [ref=e2004] [cursor=pointer]:
                      - text: $50.0M
                      - generic [ref=e2005]: "2"
                  - button "$50.0M 2":
                    - generic [ref=e2006] [cursor=pointer]:
                      - text: $50.0M
                      - generic [ref=e2007]: "2"
                  - button "$47.9M 2":
                    - generic [ref=e2008] [cursor=pointer]:
                      - text: $47.9M
                      - generic [ref=e2009]: "2"
                  - button "$47.5M":
                    - generic [ref=e2010] [cursor=pointer]: $47.5M
                  - button "$47.0M 5":
                    - generic [ref=e2011] [cursor=pointer]:
                      - text: $47.0M
                      - generic [ref=e2012]: "5"
                  - button "$46.0M 3":
                    - generic [ref=e2013] [cursor=pointer]:
                      - text: $46.0M
                      - generic [ref=e2014]: "3"
                  - button "$45.0M 2":
                    - generic [ref=e2015] [cursor=pointer]:
                      - text: $45.0M
                      - generic [ref=e2016]: "2"
                  - button "$45.0M":
                    - generic [ref=e2017] [cursor=pointer]: $45.0M
                  - button "$45.0M 2":
                    - generic [ref=e2018] [cursor=pointer]:
                      - text: $45.0M
                      - generic [ref=e2019]: "2"
                  - button "$45.0M":
                    - generic [ref=e2020] [cursor=pointer]: $45.0M
                  - button "$43.5M":
                    - generic [ref=e2021] [cursor=pointer]: $43.5M
                  - button "$42.5M":
                    - generic [ref=e2022] [cursor=pointer]: $42.5M
                  - button "$42.5M 3":
                    - generic [ref=e2023] [cursor=pointer]:
                      - text: $42.5M
                      - generic [ref=e2024]: "3"
                  - button "$40.5M 2":
                    - generic [ref=e2025] [cursor=pointer]:
                      - text: $40.5M
                      - generic [ref=e2026]: "2"
                  - button "$40.0M":
                    - generic [ref=e2027] [cursor=pointer]: $40.0M
                  - button "$40.0M":
                    - generic [ref=e2028] [cursor=pointer]: $40.0M
                  - button "$40.0M 3":
                    - generic [ref=e2029] [cursor=pointer]:
                      - text: $40.0M
                      - generic [ref=e2030]: "3"
                  - button "$39.8M":
                    - generic [ref=e2031] [cursor=pointer]: $39.8M
                  - button "$39.0M 2":
                    - generic [ref=e2032] [cursor=pointer]:
                      - text: $39.0M
                      - generic [ref=e2033]: "2"
                  - button "$37.5M 11":
                    - generic [ref=e2034] [cursor=pointer]:
                      - text: $37.5M
                      - generic [ref=e2035]: "11"
                  - button "$37.5M 11":
                    - generic [ref=e2036] [cursor=pointer]:
                      - text: $37.5M
                      - generic [ref=e2037]: "11"
                  - button "$37.5M 11":
                    - generic [ref=e2038] [cursor=pointer]:
                      - text: $37.5M
                      - generic [ref=e2039]: "11"
                  - button "$37.5M":
                    - generic [ref=e2040] [cursor=pointer]: $37.5M
                  - button "$36.5M 11":
                    - generic [ref=e2041] [cursor=pointer]:
                      - text: $36.5M
                      - generic [ref=e2042]: "11"
                  - button "$36.5M 11":
                    - generic [ref=e2043] [cursor=pointer]:
                      - text: $36.5M
                      - generic [ref=e2044]: "11"
              - generic:
                - generic:
                  - generic [ref=e2045]:
                    - button "Zoom in" [ref=e2046] [cursor=pointer]: +
                    - button "Zoom out" [ref=e2047] [cursor=pointer]: −
                  - generic [ref=e2048]:
                    - link "Leaflet" [ref=e2049] [cursor=pointer]:
                      - /url: https://leafletjs.com
                      - img [ref=e2050]
                      - text: Leaflet
                    - text: "|"
                    - link "OpenFreeMap" [ref=e2054] [cursor=pointer]:
                      - /url: https://openfreemap.org
                    - link "© OpenMapTiles" [ref=e2055] [cursor=pointer]:
                      - /url: https://www.openmaptiles.org/
                    - text: Data from
                    - link "OpenStreetMap" [ref=e2056] [cursor=pointer]:
                      - /url: https://www.openstreetmap.org/copyright
            - generic [ref=e2057]:
              - link "OpenFreeMap" [ref=e2058] [cursor=pointer]:
                - /url: https://openfreemap.org
              - text: ©
              - link "OpenMapTiles" [ref=e2059] [cursor=pointer]:
                - /url: https://openmaptiles.org
              - text: ·
              - link "OpenStreetMap" [ref=e2060] [cursor=pointer]:
                - /url: https://www.openstreetmap.org/copyright
  - contentinfo "Site footer" [ref=e2061]:
    - generic [ref=e2062]:
      - generic [ref=e2063]:
        - generic [ref=e2064]:
          - paragraph [ref=e2065]: MALLANNYC
          - paragraph [ref=e2066]:
            - text: Mallan Real Estate Inc.
            - text: 400 East 90th Street, Suite 17C
            - text: New York, NY 10128
          - paragraph [ref=e2067]: "License #10991205323"
          - generic [ref=e2068]:
            - link "Follow us on Instagram" [ref=e2069] [cursor=pointer]:
              - /url: https://www.instagram.com/mallanrealestate/
              - img [ref=e2070]
            - link "Follow us on Facebook" [ref=e2072] [cursor=pointer]:
              - /url: https://www.facebook.com/MAllanrealestate
              - img [ref=e2073]
            - link "Follow us on LinkedIn" [ref=e2075] [cursor=pointer]:
              - /url: https://www.linkedin.com/company/mallan-real-estate-inc/
              - img [ref=e2076]
            - link "Follow us on X" [ref=e2078] [cursor=pointer]:
              - /url: https://x.com/NYCondos
              - img [ref=e2079]
        - generic [ref=e2081]:
          - paragraph [ref=e2082]: Search
          - link "Buy" [ref=e2083] [cursor=pointer]:
            - /url: /buy
          - link "Rent" [ref=e2084] [cursor=pointer]:
            - /url: /rent
          - link "Sell" [ref=e2085] [cursor=pointer]:
            - /url: /sell
          - link "Agents" [ref=e2086] [cursor=pointer]:
            - /url: /agents
          - link "Neighborhoods" [ref=e2087] [cursor=pointer]:
            - /url: /neighborhoods
          - link "Open Houses" [ref=e2088] [cursor=pointer]:
            - /url: /open-houses
          - link "Buildings" [ref=e2089] [cursor=pointer]:
            - /url: /search?view=buildings
        - generic [ref=e2090]:
          - paragraph [ref=e2091]: Company
          - link "About" [ref=e2092] [cursor=pointer]:
            - /url: /about
          - link "Agents" [ref=e2093] [cursor=pointer]:
            - /url: /agents
          - link "Buyer's Guide" [ref=e2094] [cursor=pointer]:
            - /url: /resources/buyers-guide
          - link "Seller's Guide" [ref=e2095] [cursor=pointer]:
            - /url: /resources/sellers-guide
          - link "Open Houses" [ref=e2096] [cursor=pointer]:
            - /url: /open-houses
          - link "Contact" [ref=e2097] [cursor=pointer]:
            - /url: /contact
        - generic [ref=e2098]:
          - paragraph [ref=e2099]: Legal
          - link "Fair Housing" [ref=e2100] [cursor=pointer]:
            - /url: /fair-housing
          - link "Privacy Policy" [ref=e2101] [cursor=pointer]:
            - /url: /privacy
          - link "Terms of Service" [ref=e2102] [cursor=pointer]:
            - /url: /terms
          - link "Standardized Operating Procedures" [ref=e2103] [cursor=pointer]:
            - /url: /sop
          - link "Reasonable Accommodations" [ref=e2104] [cursor=pointer]:
            - /url: /reasonable-accommodations
      - generic [ref=e2105]:
        - generic [ref=e2106]:
          - img "Equal Housing Opportunity" [ref=e2107]
          - paragraph [ref=e2108]: Equal Housing Opportunity
          - generic [ref=e2109]: "|"
          - link "Fair Housing Policy" [ref=e2110] [cursor=pointer]:
            - /url: /fair-housing
          - generic [ref=e2111]: "|"
          - link "HUD Fair Housing" [ref=e2112] [cursor=pointer]:
            - /url: https://www.hud.gov/program_offices/fair_housing_equal_opp
          - generic [ref=e2113]: "|"
          - link "NY State Division of Human Rights" [ref=e2114] [cursor=pointer]:
            - /url: https://dhr.ny.gov/housing-discrimination
          - generic [ref=e2115]: "|"
          - link "NYC Human Rights" [ref=e2116] [cursor=pointer]:
            - /url: https://www.nyc.gov/site/cchr/law/fair-housing.page
        - paragraph [ref=e2117]:
          - strong [ref=e2118]: "REBNY RLS:"
          - text: Listings may be provided by REBNY RLS. Data deemed reliable but not guaranteed. Updated continuously.
          - strong [ref=e2119]: "IDX:"
          - text: For consumers' personal, non-commercial use only.
          - strong [ref=e2120]: "Fair Housing:"
          - text: All listings comply with federal, NY State, and NYC fair housing laws.
      - generic [ref=e2121]:
        - paragraph [ref=e2122]: "© 2026 Mallan Real Estate Inc. · License #10991205323"
        - generic [ref=e2123]:
          - link "Admin" [ref=e2124] [cursor=pointer]:
            - /url: /admin/login
          - paragraph [ref=e2125]: Equal Housing Opportunity
  - alert [ref=e2126]
  - dialog "Cookie Preferences" [ref=e2127]:
    - generic [ref=e2129]:
      - generic [ref=e2130]:
        - heading "Cookie Preferences" [level=2] [ref=e2131]
        - paragraph [ref=e2132]:
          - text: We use cookies to provide essential website functionality. Optional cookies help us understand how you use our site.
          - link "Privacy Policy" [ref=e2133] [cursor=pointer]:
            - /url: /privacy
      - generic [ref=e2134]:
        - button "Customize preferences" [ref=e2135] [cursor=pointer]
        - generic [ref=e2136]:
          - button "Essential Only" [ref=e2137] [cursor=pointer]
          - button "Accept All" [ref=e2138] [cursor=pointer]
  - img [ref=e2141]
```

# Test source

```ts
  1   | /**
  2   |  * Search-card photo carousel + right-sized image delivery.
  3   |  *
  4   |  * Two defects, both browser-confirmed on production 2026-07-31:
  5   |  *
  6   |  *   1. CAROUSEL — only SplitCard had one. A snapshot of 100 cards on
  7   |  *      /search?tab=buy-residential found 0 next/prev buttons and exactly
  8   |  *      1 <img> per listing, while the cards still advertised a photo
  9   |  *      count. Maya: "there is only 1st photo the photos are missing from
  10  |  *      the listings pages."
  11  |  *
  12  |  *   2. IMAGE SIZE — a card rendering at ~343-356 CSS px downloaded the
  13  |  *      full R2 original (one measured at 1,437,336 bytes). `thumbUrl` in
  14  |  *      the DTO is byte-identical to `url`, so no smaller stored variant
  15  |  *      existed to switch to.
  16  |  *
  17  |  * Each test below is written to FAIL on the pre-fix build.
  18  |  *
  19  |  * Run:
  20  |  *   PLAYWRIGHT_BASE_URL=<preview-url> npx playwright test tests/e2e/search-card-carousel.spec.ts
  21  |  */
  22  | import { test, expect, type Page, type Request } from '@playwright/test';
  23  | 
  24  | /** Every search surface that renders a card variant. */
  25  | const GRID_PAGES = ['/search?tab=buy-residential', '/search?tab=rent-residential'];
  26  | const FEATURED_PAGES = ['/buy', '/rent'];
  27  | 
  28  | /** Wait for cards to arrive (they land via a client-side fetch). */
  29  | async function waitForCards(page: Page) {
  30  |   await page.waitForSelector('.glass-card img', { timeout: 30_000 });
  31  |   await page.waitForTimeout(1500);
  32  | }
  33  | 
  34  | /**
  35  |  * Find a card that actually has more than one photo. Cards with a single
  36  |  * photo correctly render no arrows, so asserting against them would be a
  37  |  * false negative. Returns the card locator, or null if the page happens
  38  |  * to serve only single-photo listings.
  39  |  */
  40  | async function firstMultiPhotoCard(page: Page) {
  41  |   const cards = page.locator('.glass-card');
  42  |   const n = Math.min(await cards.count(), 12);
  43  |   for (let i = 0; i < n; i++) {
  44  |     const card = cards.nth(i);
  45  |     if ((await card.getByRole('button', { name: 'Next photo' }).count()) > 0) {
  46  |       return card;
  47  |     }
  48  |   }
  49  |   return null;
  50  | }
  51  | 
  52  | test.describe('Card carousel — desktop', () => {
  53  |   test.use({ viewport: { width: 1440, height: 900 } });
  54  | 
  55  |   for (const path of GRID_PAGES) {
  56  |     test(`${path} — multi-photo cards expose photo navigation`, async ({ page }) => {
  57  |       await page.goto(path);
  58  |       await waitForCards(page);
  59  | 
  60  |       // FAILS PRE-FIX: GridCard rendered no next/prev controls at all.
  61  |       const nextButtons = page.getByRole('button', { name: 'Next photo' });
  62  |       const prevButtons = page.getByRole('button', { name: 'Previous photo' });
  63  |       expect(await nextButtons.count()).toBeGreaterThan(0);
  64  |       expect(await prevButtons.count()).toBe(await nextButtons.count());
  65  |     });
  66  | 
  67  |     test(`${path} — Next advances the image and the counter`, async ({ page }) => {
  68  |       await page.goto(path);
  69  |       await waitForCards(page);
  70  | 
  71  |       const card = await firstMultiPhotoCard(page);
  72  |       test.skip(card === null, 'no multi-photo listing on this page right now');
  73  | 
  74  |       const img = card!.locator('img').first();
  75  |       const before = await img.getAttribute('src');
  76  |       const counterBefore = (await card!.textContent())?.match(/\b(\d+)\/(\d+)\b/)?.[0];
  77  | 
  78  |       await card!.hover();
  79  |       await card!.getByRole('button', { name: 'Next photo' }).click();
  80  |       await page.waitForTimeout(400);
  81  | 
  82  |       // FAILS PRE-FIX (no button to click, and no index state to change).
  83  |       const after = await img.getAttribute('src');
  84  |       expect(after, 'clicking Next must change the displayed image').not.toBe(before);
  85  | 
  86  |       const counterAfter = (await card!.textContent())?.match(/\b(\d+)\/(\d+)\b/)?.[0];
> 87  |       expect(counterAfter, 'the n/N counter must advance').not.toBe(counterBefore);
      |                                                                ^ Error: the n/N counter must advance
  88  |       expect(counterAfter).toMatch(/^2\//);
  89  |     });
  90  | 
  91  |     test(`${path} — Previous walks back to the first photo`, async ({ page }) => {
  92  |       await page.goto(path);
  93  |       await waitForCards(page);
  94  | 
  95  |       const card = await firstMultiPhotoCard(page);
  96  |       test.skip(card === null, 'no multi-photo listing on this page right now');
  97  | 
  98  |       const img = card!.locator('img').first();
  99  |       const first = await img.getAttribute('src');
  100 | 
  101 |       await card!.hover();
  102 |       await card!.getByRole('button', { name: 'Next photo' }).click();
  103 |       await page.waitForTimeout(300);
  104 |       await card!.getByRole('button', { name: 'Previous photo' }).click();
  105 |       await page.waitForTimeout(300);
  106 | 
  107 |       expect(await img.getAttribute('src')).toBe(first);
  108 |     });
  109 | 
  110 |     test(`${path} — an arrow click must NOT navigate to the listing`, async ({ page }) => {
  111 |       await page.goto(path);
  112 |       await waitForCards(page);
  113 | 
  114 |       const card = await firstMultiPhotoCard(page);
  115 |       test.skip(card === null, 'no multi-photo listing on this page right now');
  116 | 
  117 |       const urlBefore = page.url();
  118 |       await card!.hover();
  119 |       await card!.getByRole('button', { name: 'Next photo' }).click();
  120 |       await page.waitForTimeout(600);
  121 | 
  122 |       // The arrows sit inside the card's <Link>; without
  123 |       // preventDefault + stopPropagation this navigates to the listing.
  124 |       expect(page.url(), 'arrow click leaked through to the card link').toBe(urlBefore);
  125 |     });
  126 | 
  127 |     test(`${path} — a non-arrow click still opens the listing`, async ({ page }) => {
  128 |       await page.goto(path);
  129 |       await waitForCards(page);
  130 | 
  131 |       const urlBefore = page.url();
  132 |       // Click the price line — ordinary card content, not a control.
  133 |       await page.locator('.glass-card').first().locator('p').first().click();
  134 |       await page.waitForTimeout(1500);
  135 | 
  136 |       expect(page.url(), 'the card must still be a link to the listing').not.toBe(urlBefore);
  137 |       expect(page.url()).toMatch(/\/listing\//);
  138 |     });
  139 |   }
  140 | });
  141 | 
  142 | test.describe('Card carousel — mobile swipe', () => {
  143 |   test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  144 | 
  145 |   test('/search?tab=buy-residential — swiping left advances the photo', async ({ page }) => {
  146 |     await page.goto('/search?tab=buy-residential');
  147 |     await waitForCards(page);
  148 | 
  149 |     const card = page.locator('.glass-card').first();
  150 |     const img = card.locator('img').first();
  151 |     const before = await img.getAttribute('src');
  152 | 
  153 |     const box = await img.boundingBox();
  154 |     expect(box).not.toBeNull();
  155 |     const y = box!.y + box!.height / 2;
  156 |     // Swipe further than useSwipe's 40px threshold.
  157 |     await page.touchscreen.tap(box!.x + box!.width * 0.8, y);
  158 |     await page.locator('body').dispatchEvent('touchstart');
  159 |     await img.dispatchEvent('touchstart', {
  160 |       touches: [{ clientX: box!.x + box!.width * 0.85, clientY: y }],
  161 |     });
  162 |     await img.dispatchEvent('touchmove', {
  163 |       touches: [{ clientX: box!.x + box!.width * 0.15, clientY: y }],
  164 |     });
  165 |     await img.dispatchEvent('touchend', { touches: [] });
  166 |     await page.waitForTimeout(500);
  167 | 
  168 |     // FAILS PRE-FIX: GridCard had no touch handlers at all on mobile.
  169 |     const after = await img.getAttribute('src');
  170 |     expect(after, 'a left swipe must advance to the next photo').not.toBe(before);
  171 |   });
  172 | });
  173 | 
  174 | test.describe('Image delivery — cards must not download originals', () => {
  175 |   test.use({ viewport: { width: 1440, height: 900 } });
  176 | 
  177 |   for (const path of [...GRID_PAGES, ...FEATURED_PAGES]) {
  178 |     test(`${path} — no card requests an oversized source image`, async ({ page }) => {
  179 |       const imageRequests: Array<{ url: string; width: number | null }> = [];
  180 |       const onRequest = (req: Request) => {
  181 |         if (req.resourceType() !== 'image') return;
  182 |         const url = req.url();
  183 |         const w = new URL(url, 'http://x').searchParams.get('w');
  184 |         imageRequests.push({ url, width: w ? Number(w) : null });
  185 |       };
  186 |       page.on('request', onRequest);
  187 | 
```