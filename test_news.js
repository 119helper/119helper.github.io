const { DOMParser } = require('xmldom');

async function testFetch() {
  const url = 'https://119-helper-api.teemozipsa.workers.dev/api/news?type=google&query=%EC%84%9C%EC%9A%B8%20%EC%86%8C%EB%B0%A9';
  console.log('Fetching', url);
  const response = await fetch(url, { headers: { 'Origin': 'http://localhost:5173' }});
  const xmlText = await response.text();
  console.log('Response length:', xmlText.length);
  
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  const itemsNodes = xmlDoc.getElementsByTagName('item');
  const items = [];
  for(let i=0; i<Math.min(itemsNodes.length, 15); i++) items.push(itemsNodes.item(i));
  
  console.log(`Found ${items.length} items`);
  if (items.length > 0) {
      const item = items[0];
      const link = item.getElementsByTagName('link')[0]?.textContent;
      const title = item.getElementsByTagName('title')[0]?.textContent;
      
      let pubDateStr = item.getElementsByTagName('pubDate')[0]?.textContent || 
                       item.getElementsByTagName('dc:date')[0]?.textContent || 
                       item.getElementsByTagName('date')[0]?.textContent || '';
                       
      console.log('Parsed top item:', title, pubDateStr);
      
      const d1 = new Date(pubDateStr).getTime();
      console.log('getTime():', d1);
      
      try {
          const locStr = new Date(pubDateStr).toLocaleString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          console.log('toLocaleString() result:', locStr);
      } catch (e) {
          console.error('toLocaleString() failed:', e.message);
      }
  }
}

testFetch().catch(console.error);
