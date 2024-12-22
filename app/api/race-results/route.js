import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'edge';

// Expanded list of known F1 drivers for validation
const KNOWN_F1_DRIVERS = [
    'Verstappen', 'Pérez', 'Leclerc', 'Sainz', 'Russell', 'Hamilton', 
    'Norris', 'Piastri', 'Alonso', 'Stroll', 'Ocon', 'Gasly', 
    'Tsunoda', 'Bottas', 'Sargeant', 'Albon', 'Magnussen', 
    'Hülkenberg', 'Ricciardo', 'Bearman', 'Zhou', 'Guanyu'
];

// Helper function to clean driver names
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
        
        // More precise table finding for race results
        const raceTable = $('.wikitable').filter((i, table) => {
            // Look for tables with specific race result headers
            const headers = $(table).find('th').map((j, header) => 
                $(header).text().toLowerCase().trim()
            ).get();
            
            const raceKeywords = ['pos', 'position', 'driver', 'constructor', 'laps', 'time', 'grid', 'points'];
            const captionMatch = $(table).find('caption').text().toLowerCase().includes('race');
            
            return captionMatch || raceKeywords.every(keyword => 
                headers.some(header => header.includes(keyword))
            );
        }).first();
        
        const positions = {};
        const dnfs = [];
        
        if (raceTable.length) {
            const tableRows = raceTable.find('tr').slice(1);
            
            tableRows.each((i, row) => {
                const cells = $(row).find('td');
                
                if (cells.length >= 7) {
                    const posText = $(cells[0]).text().trim();
                    const driverText = $(cells[2]).text().trim();
                    const constructorText = $(cells[3]).text().trim();
                    const lapsText = $(cells[4]).text().trim();
                    const timeText = $(cells[5]).text().trim();
                    const gridText = $(cells[6]).text().trim();
                    const pointsText = $(cells[7]).text().trim();
                    
                    // Validate position is a number
                    if (/^\d+$/.test(posText)) {
                        const pos = parseInt(posText);
                        
                        // Extract last name and clean
                        const dirtyDriverName = driverText.split(' ').pop();
                        const cleanedDriverName = cleanDriverName(dirtyDriverName);
                        
                        // Validate driver name
                        if (KNOWN_F1_DRIVERS.includes(cleanedDriverName)) {
                            positions[cleanedDriverName] = pos;
                            
                            // Check for DNF
                            if (timeText.toLowerCase().includes('ret') || timeText.toLowerCase().includes('dnf')) {
                                dnfs.push({
                                    driver: cleanedDriverName,
                                    lap: 0  // Placeholder for lap number
                                });
                            }
                        }
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
                tableHTML: raceTable.html()  // Add full table HTML for debugging
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Failed to fetch race results',
            details: error.message
        }, { status: 500 });
    }
}
