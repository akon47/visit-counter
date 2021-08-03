const visitorModel = require('./models/VisitorModel.js');
const url = require('url');

const createCounterSvg = (title, text) => {
    const title = "방문자";
    const titleTextWidth = 45;
    const counterTextWidth = 45 + ((text.length - 5) * 6);

    const result =
        `
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${titleTextWidth + counterTextWidth}" height="20">
            <linearGradient id="smooth" x2="0" y2="100%">
                <stop offset="0" stop-color="#bbb" stop-opacity="0.1" />
                <stop offset="1" stop-opacity="0.1" />
            </linearGradient>

            <mask id="round">
                <rect width="${titleTextWidth + counterTextWidth}" height="20" rx="3" ry="3" fill="#fff" />
            </mask>

            <g mask="url(#round)">
                <rect width="${titleTextWidth}" height="20" fill="#555" />
                <rect x="${titleTextWidth}" width="${counterTextWidth}" height="20" fill="#79c83d" />
                <rect width="${titleTextWidth + counterTextWidth}" height="20" fill="url(#smooth)" />
            </g>

            <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">
                <text x="${(titleTextWidth / 2.0) + 1}" y="15" fill="#010101" fill-opacity="0.3">${title}</text>
                <text x="${(titleTextWidth / 2.0) + 1}" y="14" fill="#fff">${title}</text>
                <text x="${titleTextWidth + (counterTextWidth / 2.0) - 1}" y="15" fill="#010101" fill-opacity="0.3"> ${text} </text>
                <text x="${titleTextWidth + (counterTextWidth / 2.0) - 1}" y="14" fill="#fff"> ${text} </text>
            </g>
        </svg>
        `;
    return result;
};

require('./db.js')();
const server = require('http').createServer(async (request, response) => {
    if (request.method === 'GET') {
        const queryObject = new URL(request.url, true).query;
        if (queryObject.key) {
            const address = request.headers['x-forwarded-for']?.split(',').shift() || request.socket?.remoteAddress;

            let now = new Date(Date.now() + (9 * 3600 * 1000)); // UTC를 한국 시간으로 변경. UTC+09:00
            now.setHours(0, 0, 0, 0); // 한국시간에서 하루의 시작 시간으로 변경.
            const startUtc = new Date(now.getTime() - (9 * 3600 * 1000)) // 한국의 시작시간에서 UTC로 변경.
            const endUtc = new Date(startUtc.getTime() + (24 * 3600 * 1000)); // 시작시간에서 하루 만큼.

            if (!(await visitorModel
                .findOne({ address: address, key: queryObject.key, visitedDate: { $gte: startUtc, $lt: endUtc } })
                .lean()
                .exec())) { // 오늘 하루동안 방문한적이 없는 IP 라면 DB에 추가.
                await visitorModel.create({
                    address: address,
                    key: queryObject.key,
                });
            }

            const totalVisitorCount = await visitorModel
                .find({ key: queryObject.key })
                .count()
                .lean()
                .exec() || 0;
            const todayVisitorCount = await visitorModel
                .find({ key: queryObject.key, visitedDate: { $gte: startUtc, $lt: endUtc } })
                .count()
                .lean()
                .exec() || 0;

            response.writeHead(200, { "Content-Type": "image/svg+xml" });
            response.end(createCounterSvg("방문자", `${todayVisitorCount} / ${totalVisitorCount}`));
        } else {
            response.statusCode = 404;
            response.end();
        }
    } else {
        response.statusCode = 404;
        response.end();
    }
}).listen(60000, '0.0.0.0');