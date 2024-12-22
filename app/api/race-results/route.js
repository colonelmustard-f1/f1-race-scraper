import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'edge';

// Known F1 drivers for additional validation
const KNOWN_F1_DRIVERS = [
    'Verstappen', 'Pérez', 'Leclerc', 'Sainz', 'Russell', 'Hamilton', 
    'Norris', 'Piastri', 'Alonso', 'Stroll', 'Ocon', 'Gasly', 
    'Tsunoda', 'Bottas', 'Sargeant', 'Albon', 'Magnussen', 
    'Hülkenberg', 'Ricciardo', 'Bearman', 'Zhou', 'Guanyu'
];

// Clean and validate driver names
function cleanDriverName(name) {
    return name
        .replace(/\s*\(.*\)$/, '')  // Remove parenthetical notes
        .replace(/\*$/, '')          // Remove asterisks
        .trim();
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const race = searchParams.get('race');

    if (!year || !race) {
        return NextResponse.json({
            error: 'Missing required parameters',
            usage: '/api/race-results?year=2024&race=Miami'
        }, { status: 400 });
    }

    try {
        const url = `https://en.wikipedia.org/wiki/${year}_${race}_Grand_Prix`;
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Detailed table finding with specific race results table criteria
        const raceTable = $('.wikitable').filter((i, table) => {
            const caption = $(table).find('caption').text().toLowerCase();
            const headers = $(table).find('th').map((j, header) => 
                $(header).text().toLowerCase().trim()
            ).get();
            
            const raceKeywords = ['race', 'result', 'classification', 'finishers'];
            const headerKeywords = ['pos', 'position', 'driver', 'time'];
            
            const hasCaptionMatch = raceKeywords.some(keyword => caption.includes(keyword));
            const hasHeaderMatch = headerKeywords.some(keyword => 
                headers.some(header => header.includes(keyword))
            );
            
            return hasCaptionMatch || hasHeaderMatch;
        }).first();
        
        const positions = {};
        const dnfs = [];
        
        if (raceTable.length) {
            const tableRows = raceTable.find('tr').slice(1);
            
            // Possible column configurations to extract positions and drivers
            const parseConfigs = [
                { pos: 0, driver: 2 },   // Standard Wikipedia table format
                { pos: 1, driver: 2 },   // Alternative format
                { pos: 0, driver: 1 }    // Another possible format
            ];

            tableRows.each((i, row) => {
                const cells = $(row).find('td');
                
                for (let config of parseConfigs) {
                    // Ensure we have enough columns
                    if (cells.length > Math.max(config.pos, config.driver)) {
                        const posText = $(cells[config.pos]).text().trim();
                        const driverText = $(cells[config.driver]).text().trim();
                        
                        // Validate position is a number
                        if (/^\d+$/.test(posText)) {
                            const pos = parseInt(posText);
                            
                            // Extract driver name (last word)
                            const dirtyDriverName = driverText.split(' ').pop();
                            const cleanedDriverName = cleanDriverName(dirtyDriverName);
                            
                            // Validate driver name
                            if (KNOWN_F1_DRIVERS.includes(cleanedDriverName)) {
                                positions[cleanedDriverName] = pos;
                                break;  // Exit config loop once we find a valid row
                            }
                        }
                    }
                }

                // Attempt to find DNFs in a separate pass
                const statusCell = cells.length > 5 ? $(cells[5]).text().toLowerCase().trim() : '';
                if (statusCell.includes('ret') || statusCell.includes('dnf')) {
                    const driverText = $(cells[2]).text().trim();
                    const dirtyDriverName = driverText.split(' ').pop();
                    const cleanedDriverName = cleanDriverName(dirtyDriverName);
                    
                    if (KNOWN_F1_DRIVERS.includes(cleanedDriverName)) {
                        dnfs.push({
                            driver: cleanedDriverName,
                            lap: 0  // Placeholder for now
                        });
                    }
                }
            });
        }
        
        return NextResponse.json({
            positions,
            dnfs,
            url,
            debug: {
                foundTable: raceTable.length > 0,
                foundPositions: Object.keys(positions).length,
                foundDNFs: dnfs.length,
                parsedTable: raceTable.html()  // Add full table HTML for debugging
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Failed to fetch race results',
            details: error.message
        }, { status: 500 });
    }
}
