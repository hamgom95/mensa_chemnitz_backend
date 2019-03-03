var ibmdb = require('ibm_db');

const https = require('https');
const {parseString} = require('xml2js');
const url = require('url');
const querystring = require("querystring");
const {promisify} = require("util");

const parseBool = str => str === "true";

const requestOpts = async (opts) => new Promise((resolve, reject) => {
    if (opts.url) {
        const u = url.parse(opts.url);
        console.log(u.path);
        Object.assign(opts, u);
    }

    if (opts.query) {
        opts.path = `${opts.path}?${querystring.stringify(opts.query)}`;
    }

    const req = https.request(opts, (resp) => {
        let chunks = [];
        resp.on('data', (chunk) => { chunks.push(chunk); });
        resp.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on("error", (err) => reject(err));
    req.end(opts.body);
});

const parseXml = async (xmlStr, options={}) => new Promise((resolve, reject) => {
    parseString(xmlStr, options, (err, data) => {
        if (err) reject(err);
        resolve(data);
    });
});

async function parseSpeiseplan(xml) {
    if (xml.speiseplan.essen === undefined) return [];

    const meals = xml.speiseplan.essen.map(async (meal) => Object.assign(meal.$, {
        deutsch: meal.deutsch[0],
        vegetarisch: parseBool(meal.vegetarisch),
        schwein: parseBool(meal.schwein),
        alkohol: parseBool(meal.alkohol),
        rind: parseBool(meal.rind),
        img_small_data: (await requestOpts({url: meal.img_small, rejectUnauthorized: false })),
        img_big_data: (await requestOpts({url: meal.img_big, rejectUnauthorized: false})),
        prices: meal.pr.reduce((acc, price) => (acc[price.$.gruppe] = price._, acc), {}),
    }));
    return Promise.all(meals);
}


const MensaIds = {
    MensaReichenhainer: 1479835489,
    MensaStrana: 773823070,
    MensaScheffelberg: 3,
    MensaRing: 4,
    CafetariaRing: 5,
    CafetariaStrana: 6,
    CafetariaReichenhainer: 7,
    CafetariaScheffelberg: 8,
};

const today = new Date();

async function load({mensa = "MensaReichenhainer", day = today.getDate(), month = today.getMonth()+1, year = today.getFullYear()} = {}) {
    const data = await requestOpts({
            host: "www.swcz.de",
            path: `/bilderspeiseplan/xml.php`,
            query: {
                plan: MensaIds[mensa],
                tag: day,
                monat: month,
                jahr: year,
            },
        });
    const xml = await parseXml(data.toString("UTF-8"));
    return await parseSpeiseplan(xml);
}

const dbOpen = promisify(ibmdb.open);
const dbQuery = (conn, ...args) => promisify(conn.query).call(conn, ...args);
const dbClose = (conn) => promisify(conn.close).call(conn);
const dbPrepare = (conn, ...args) => promisify(conn.prepare).call(conn, ...args);
const dbExecute = (stmt, ...args) => promisify(stmt.execute).call(stmt, ...args);

async function main({__bx_creds}) {

    let res;
    try {
        res = await load();
    } catch(err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: `Error: ${err.message}`,
        };
    }


    const {dsn} = __bx_creds["dashDB For Transactions"];

    let conn;
    try {
        conn = await dbOpen(dsn);

        const stmtMeal = await dbPrepare(conn, `insert into meals(id, plan_id, german, category, price_g) values(?,?,?,?,?)`);
        const stmtPlan = await dbPrepare(conn, `insert into plans(mensa_id, date) values(?,?)`);

        const id = await dbExecute(stmtPlan, [1479835489, '2018-03-19 00:00:00']);
        // await dbExecute(stmtMeal, [1, id, "deutsch", "cat", 3.20]);

    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: `Error: ${err.message}`,
        };
    } finally {
        if (conn) await dbClose(conn);
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {res},
    };
}
exports.main = main;