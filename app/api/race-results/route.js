import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'edge';

// Helper function to clean and validate driver names
function cleanDriverName(name) {
    // Remove known suffixes, handle special characters
    return name
        .replace(/\s*\(.*\)$/, '')  // Remove parenthetical notes
        .replace(/\*$/, '')          // Remove asterisks
        .trim();
}

// List of known F1 drivers for additional validation
const KNOWN_F1_DRIVERS = [
    'Verstappen', 'Pérez', 'Leclerc', 'Sainz', 'Russell', 'Hamilton', 
    'Norris', 'Piastri', 'Alonso', 'Stroll', 'Ocon', 'Gasly', 
    'Tsunoda', 'De Vries', 'Bottas', 'Zhou', 'Sargeant', 'Albon', 
    'Magnussen', 'Hülkenberg', 'Ricciardo', 'Bearman'
];

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
        
        // More precise table finding
        const raceTable = $('.wikitable').filter((i, table) => {
            const headers = $(table).find('th').map((j, header) => 
                $(header).text().toLowerCase().trim()
            ).get();
            
            // Look for tables with specific race result headers
            const headerKeywords = ['pos', 'position', 'driver', 'constructor', 'time', 'laps'];
            return headerKeywords.some(keyword => 
                headers.some(header => header.includes(keyword))
            );
        }).first();
        
        const positions = {};
        const dnfs = [];
        
        if (raceTable.length) {
            const tableRows = raceTable.find('tr').slice(1);
            
            tableRows.each((i, row) => {
                const cells = $(row).find('td');
                
                // More precise row parsing configurations
                const parseConfigs = [
                    { pos: 0, driver: 2, status: 5 },   // Standard Wikipedia table format
                    { pos: 0, driver: 1, status: 5 },   // Alternative format
                    { pos: 1, driver: 2, status: 5 }    // Another possible format
                ];

                for (let config of parseConfigs) {
                    if (cells.length > Math.max(config.pos, config.driver, config.status)) {
                        const posText = $(cells[config.pos]).text().trim();
                        const driverText = $(cells[config.driver]).text().trim();
                        const statusText = $(cells[config.status]).text().trim().toLowerCase();
                        
                        // Validate position is a number
                        if (/^\d+$/.test(posText)) {
                            const pos = parseInt(posText);
                            
                            // Clean and validate driver name
                            const dirtyDriverName = driverText.split(' ').pop();
                            const cleanedDriverName = cleanDriverName(dirtyDriverName);
                            
                            // Only add if driver name looks valid
                            if (KNOWN_F1_DRIVERS.includes(cleanedDriverName)) {
                                // Check for DNF
                                if (statusText.includes('ret') || statusText.includes('dnf')) {
                                    dnfs.push({
                                        driver: cleanedDriverName,
                                        lap: 0  // We'll improve lap detection later
                                    });
                                } else {
                                    positions[cleanedDriverName] = pos;
                                }
                                
                                // Break out of config loop if we found a valid row
                                break;
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
                foundDNFs: dnfs.length
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Failed to fetch race results',
            details: error.message
        }, { status: 500 });
    }
}
