import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import Papa from 'papaparse';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API to fetch and proxy Google Sheet CSVs
  app.get('/api/sync-data', async (req, res) => {
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
        
        // Remove header row and any completely empty rows
        results[key] = parsed.data;
        console.log(`Fetched ${key} sheet: ${parsed.data.length} rows`);
        if (parsed.data.length > 0) {
          console.log(`First row of ${key}:`, parsed.data[0]);
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Error fetching sheets:', error);
      res.status(500).json({ error: 'Failed to fetch data from Google Sheets' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
