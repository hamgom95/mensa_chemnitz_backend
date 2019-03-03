
const ibmdb = require('ibm_db');
const {promisify} = require('util');

const sql = {
    setup: [
        `
        create table plans (
            id int not null generated always as identity (start with 1, increment by 1, no cache),
            date timestamp not null,
            mensa_id int not null,
            primary key (
                id
            ),
            unique(
                date,
                mensa_id
            )
        );
        `,
        `
        create table meals (
            id int not null,
            plan_id int not null,
            german varchar(255) not null,
            category varchar(255) not null,
            price_s float,
            price_m float,
            price_g float,
            price_all float,
            pig boolean,
            alcohol boolean,
            vegetarian boolean,
            beef boolean,
            img_small_url varchar(255),
            img_big_url varchar(255),
            date timestamp,

            primary key (
                id
            ),

            foreign key (plan_id) references plans (id)
        );
        `,
        `
        create table comments (
            id int not null generated always as identity,
            meal_id int not null,
            score int not null,
            comment varchar(1000),

            foreign key (meal_id) references meals (id)
        );
        `,
    ],
    cleanup: [
        `drop table plans;`,
        `drop table comments;`,
        `drop table meals;`
    ],
    sampledata: [
        `insert into plans(mensa_id, date) values(1479835489,'2018-03-19 00:00:00');`,
        `insert into meals(id, plan_id, german, category, price_g) values(1,1,'Brot','Essen 1',2.10);`,
    ],
};

const dbOpen = promisify(ibmdb.open);
const dbQuery = (conn, ...args) => promisify(conn.query).call(conn, ...args);
const dbClose = (conn) => promisify(conn.close).call(conn);

async function main({ mode, __bx_creds }) {
    const { dsn } = __bx_creds["dashDB For Transactions"];

    let conn;
    try {
        conn = await dbOpen(dsn);

        if (mode === undefined || mode.length === 0) return { dberror: "No operation selected" };

        const result = {};
        for (const op of mode) {
            const queries = sql[op];
            if (queries === undefined) return { dberror: `Unknown operation ${op}` };
            
            result[op] = [];
            for (const query of queries) {
                try {
                    data = await dbQuery(conn, query);
                    result[op].push(data);
                } catch (err) {
                    result[op].push(err);
                }    
            }
        }
        return { result };
    } catch (e) {
        return { dberror: e }
    } finally {
        if (conn) await dbClose(conn);
    }
}

exports.main = main;