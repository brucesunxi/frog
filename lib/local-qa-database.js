import pg from 'pg';

export function createLocalQaSql(connectionString) {
  const url=new URL(connectionString);
  if(process.env.VERCEL==='1'||!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_qa')) {
    throw new Error('QA database must be local, isolated, and unavailable in Vercel');
  }
  const pool=new pg.Pool({connectionString});
  const sql=async(strings,...values)=>(await pool.query(strings.reduce((q,s,i)=>q+(i?'$'+i:'')+s,''),values)).rows;
  sql.close=()=>pool.end();
  return sql;
}
