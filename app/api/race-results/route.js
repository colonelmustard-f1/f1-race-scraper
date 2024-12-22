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
        
        const raceTable = $('.wikitable').filter((i, table) => {
            return $(table).find('caption').text().toLowerCase().includes('race result');
        }).first();

        const positions = {};
        const dnfs = [];
        
        raceTable.find('tr').slice(1).each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length < 6) return;
            
            const pos = $(cells[0]).text().trim();
            const driver = $(cells[2]).text().trim().split(' ').pop();
            const status = $(cells[5]).text().trim();
            const laps = parseInt($(cells[4]).text().trim());

            if (status.toLowerCase().includes('ret')) {
                dnfs.push({
                    driver,
                    lap: laps || 0
                });
            } else {
                positions[driver] = parseInt(pos);
            }
        });

        dnfs.sort((a, b) => a.lap - b.lap);

        return NextResponse.json({
            positions,
            dnfs,
            url
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Failed to fetch race results',
            details: error.message
        }, { status: 500 });
    }
}
