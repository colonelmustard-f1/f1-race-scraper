const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeRaceResult(year, raceName) {
    const url = `https://en.wikipedia.org/wiki/${year}_${raceName}_Grand_Prix`;
    
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        
        // Find race results table
        const raceTable = $('.wikitable').filter((i, table) => {
            return $(table).find('caption').text().toLowerCase().includes('race result');
        }).first();

        // Parse results
        const positions = {};
        const dnfs = [];
        
        raceTable.find('tr').slice(1).each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length < 6) return;
            
            const pos = cells.eq(0).text().trim();
            const driver = cells.eq(2).text().trim().split(' ').pop(); // Get last name
            const status = cells.eq(5).text().trim();
            const laps = parseInt(cells.eq(4).text().trim());

            if (status.toLowerCase().includes('ret')) {
                dnfs.push({
                    driver,
                    lap: laps || 0
                });
            } else {
                positions[driver] = parseInt(pos);
            }
        });

        // Sort DNFs by lap number to determine first DNF
        dnfs.sort((a, b) => a.lap - b.lap);

        return {
            positions,
            dnfs,
            url // Return the URL for verification
        };
    } catch (error) {
        return {
            error: 'Failed to fetch race results',
            details: error.message,
            url
        };
    }
}

module.exports = async function (req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Handle OPTIONS request (for CORS)
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    const { year, race } = req.query;

    if (!year || !race) {
        return res.status(400).json({
            error: 'Missing required parameters',
            usage: '/api/race-results?year=2024&race=Miami'
        });
    }

    const results = await scrapeRaceResult(year, race);
    return res.json(results);
};
