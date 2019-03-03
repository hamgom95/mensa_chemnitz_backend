const ibmdb = require('ibm_db');
const {promisify} = require('util');

const dbOpen = promisify(ibmdb.open);
const dbPrepare = (conn, ...args) => promisify(conn.prepare).call(conn, ...args);
const dbExecute = (stmt, ...args) => promisify(stmt.execute).call(stmt, ...args);
const dbClose = (conn) => promisify(conn.close).call(conn);

async function main({ meal_id, score, comment, __bx_creds }) {
    const { dsn } = __bx_creds["dashDB For Transactions"];

    let conn;
    try {
        conn = await dbOpen(dsn);

        const stmt = await dbPrepare(conn, `insert into comments(meal_id, score, comment) values(?,?,?)`);
        const data = await dbExecute(stmt, [meal_id, score, comment]);

        return {data};
    } catch (e) {
        return { dberror: e }
    } finally {
        if (conn) await dbClose(conn);
    }
}

exports.main = main;