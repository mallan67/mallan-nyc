const http = require('http');
http.get('http://localhost:3000/agents/maya-allan', (res) => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    console.log('Size:', b.length);
    console.log('Has Past Deals:', b.includes('Past Deals'));
    console.log('Has Sales tab:', b.includes('>Sales<'));
    console.log('Has Rentals tab:', b.includes('>Rentals<'));
    console.log('Has past-deals div:', b.includes('id="past-deals"'));
    console.log('Has PastDealsSection:', b.includes('PastDealsSection'));
    console.log('Has deal cards:', b.includes('201 East 28th'));
    console.log('Has RLS badge:', b.includes('RLS'));
    console.log('Has Buyer Agent:', b.includes("Buyer"));
    console.log('Has pagination:', b.includes('Prev') || b.includes('Next'));
  });
});
