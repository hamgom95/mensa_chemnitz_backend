var ibmdb = require('ibm_db');

const https = require('https');
const xml2js = require('xml2js');
const url = require('url');
const querystring = require("querystring");
const {promisify} = require("util");

const parseXml = promisify(xml2js.parseString);

const dbOpen = promisify(ibmdb.open);
const dbQuery = (conn, ...args) => promisify(conn.query).call(conn, ...args);
const dbClose = (conn) => promisify(conn.close).call(conn);
const dbPrepare = (conn, ...args) => promisify(conn.prepare).call(conn, ...args);
const dbExecute = (stmt, ...args) => promisify(stmt.execute).call(stmt, ...args);
const dbFetchAll = (res, ...args) => promisify(res.fetchAll).call(res, ...args);


const toDbDate = date => date.toISOString().split("T", 1)[0];
const toDateObj = date => ({tag: date.getDate(), monat: date.getMonth()+1, jahr: date.getFullYear()});
const isWeekend = date => {
    const d = date.getDay();
    return (day === 6) || (day === 0); // 6 = Saturday, 0 = Sunday
};
const incrementedDate = (date, n=1) => {
    const newDate = new Date();
    newDate.setDate(date.getDate() + n);
    return newDate;
}

const parseBool = str => str === "true";

const requestOpts = async (opts) => new Promise((resolve, reject) => {
    if (opts.url) {
        const u = url.parse(opts.url);
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

async function parseSpeiseplan(xml) {
    if (xml.speiseplan.essen === undefined) return [];

    const meals = xml.speiseplan.essen.map(async (meal) => Object.assign(meal.$, {
        deutsch: meal.deutsch[0],
        vegetarisch: parseBool(meal.vegetarisch),
        schwein: parseBool(meal.schwein),
        alkohol: parseBool(meal.alkohol),
        rind: parseBool(meal.rind),
        img_small_data: meal.img_small && (await requestOpts({url: meal.img_small, rejectUnauthorized: false })),
        img_big_data: meal.img_big && (await requestOpts({url: meal.img_big, rejectUnauthorized: false})),
        prices: meal.pr.reduce((acc, price) => (acc[price.$.gruppe] = price._, acc), {}),
    }));
    return Promise.all(meals);
}

async function load(mensa_id, date) {
    const data = await requestOpts({
            host: "www.swcz.de",
            path: `/bilderspeiseplan/xml.php`,
            query: Object.assign({plan: mensa_id}, toDateObj(date)),
        });
    const xml = await parseXml(data.toString("UTF-8"));
    const meals = await parseSpeiseplan(xml);
    return meals;
}

async function load_n_store(stmtPlan, stmtMeal, mensa_id, date) {
    const meals = await load(mensa_id, date);

    const res = await dbExecute(stmtPlan, [mensa_id, toDbDate(date)]);
    const ret = await dbFetchAll(res);
    res.closeSync();

    console.log(ret[0].ID);

    const ps = meals.map(meal => dbExecute(stmtMeal, [meal.id, ret[0].ID, meal.deutsch, meal.kategorie, meal.prices.S, meal.prices.M, meal.prices.G, meal.schwein, meal.rind, meal.alkohol, meal.vegetarisch, meal.img_small, meal.img_big]));
    // TODO error here
    await Promise.all(ps);
}

async function main({__bx_creds}) {
    const {dsn} = __bx_creds["dashDB For Transactions"];

    let conn;
    try {
        conn = await dbOpen(dsn);
        
        const stmtMeal = await dbPrepare(conn, `insert into meals(id, plan_id, german, category, price_s, price_m, price_g, pig, beef, alcohol, vegetarian, img_small_url, img_big_url) values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        const stmtPlan = await dbPrepare(conn, `select id from final table (insert into plans(mensa_id, date) values(?,?))`);

        // load already saved mealplans
        const plans = await dbQuery(conn, "select id, mensa_id, date from plans");

        const today = new Date();
        
        const loads = [];
        for (const mensa_id of Object.values(MensaIds)) {
            for (let i=1; i<=7; i++) {
                const date = incrementedDate(today, i);

                // skip already stored plans
                if (plans.filter(plan => plan.DATE.split(" ", 1)[0] === toDbDate(date) && plan.MENSA_ID === mensa_id).length !== 0) continue;
                
                loads.push(load_n_store(stmtPlan, stmtMeal, mensa_id, date));
            }
        }
        await Promise.all(loads);
        

        
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
        body: {},
    };
}
exports.main = main;

async function test() {
    const res = await main({__bx_creds: {"dashDB For Transactions": {dsn: ""}}});
    console.log(res);
}
