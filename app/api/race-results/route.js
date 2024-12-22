import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'edge';

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
        
        // Enhanced debugging: Log all tables
        const allTables = [];
        $('.wikitable').each((i, table) => {
            const caption = $(table).find('caption').text().trim();
            const headers = $(table).find('th').map((j, header) => $(header).text().trim()).get();
            allTables.push({
                index: i,
                caption: caption,
                headers: headers
            });
        });
        
        // More flexible table finding strategy
        const raceTable = $('.wikitable').filter((i, table) => {
            const caption = $(table).find('caption').text().toLowerCase();
            const headers = $(table).find('th').map((j, header) => $(header).text().toLowerCase().trim()).get();
            
            // Look for tables with race-related keywords
            const raceKeywords = ['race', 'result', 'classification', 'finishers', 'final'];
            const headerKeywords = ['pos', 'position', 'driver', 'team', 'time', 'status'];
            
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
            
            tableRows.each((i, row) => {
                const cells = $(row).find('td');
                
                // Try multiple possible column configurations
                const posCandidates = [0, 1];  // Different possible position column indices
                const driverCandidates = [1, 2, 3];  // Different possible driver column indices
                const statusCandidates = [4, 5, 6];  // Different possible status column indices
                const lapCandidates = [3, 4, 5];  // Different possible lap column indices
                
                // Try different column configurations
                for (let posIndex of posCandidates) {
                    for (let driverIndex of driverCandidates) {
                        for (let statusIndex of statusCandidates) {
                            for (let lapIndex of lapCandidates) {
                                if (cells.length > Math.max(posIndex, driverIndex, statusIndex, lapIndex)) {
                                    const posText = $(cells[posIndex]).text().trim();
                                    const driverText = $(cells[driverIndex]).text().trim();
                                    const statusText = $(cells[statusIndex]).text().trim().toLowerCase();
                                    const lapText = $(cells[lapIndex]).text().trim();
                                    
                                    // Check if this looks like a valid row
                                    if (posText && /^\d+$/.test(posText) && driverText) {
                                        const pos = parseInt(posText);
                                        
                                        // Extract last name or full name depending on format
                                        const driver = driverText.split(' ').pop();
                                        
                                        // Check for DNF
                                        if (statusText.includes('ret') || statusText.includes('dnf')) {
                                            dnfs.push({
                                                driver,
                                                lap: parseInt(lapText) || 0
                                            });
                                        } else {
                                            positions[driver] = pos;
                                        }
                                        
                                        // Break out of nested loops if we found a valid row
                                        break;
                                    }
                                }
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
                allTables,
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
