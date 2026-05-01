import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import Papa from 'papaparse';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const urls = {
    parcel: 'https://docs.google.com/spreadsheets/d/1aoVSmypyWJ6VwrowvwB2wX1tr6JqiQXe8A3dyVuuLCA/export?format=csv&gid=167937708',
    mail: 'https://docs.google.com/spreadsheets/d/1aoVSmypyWJ6VwrowvwB2wX1tr6JqiQXe8A3dyVuuLCA/export?format=csv&gid=2032433352',
    ccs: 'https://docs.google.com/spreadsheets/d/1aoVSmypyWJ6VwrowvwB2wX1tr6JqiQXe8A3dyVuuLCA/export?format=csv&gid=1817017987'
  };

  try {
    const results: any = {};
    
    for (const [key, url] of Object.entries(urls)) {
      const response = await axios.get(url, { responseType: 'text' });
      const parsed = Papa.parse(response.data, { 
        header: false,
        skipEmptyLines: 'greedy'
      });
      
      results[key] = parsed.data;
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching sheets:', error);
    res.status(500).json({ error: 'Failed to fetch data from Google Sheets' });
  }
}
