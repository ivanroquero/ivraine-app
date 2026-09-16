// LOCAL TEST HARNESS ONLY. Fake auth + ephemeral PostgreSQL. Never deploy this file.
import { startFixture,fixtureKey } from './fixture';
import { createApp } from '../backend/src/app';
const fixture=await startFixture(54329);
const server=createApp({supabaseUrl:fixture.url,supabaseKey:fixtureKey,origins:['http://127.0.0.1:5173','http://localhost:5173'],trustProxy:0}).listen(3001,'127.0.0.1',()=>console.log('TEST ONLY: fixture auth 54329, actual API 3001'));
process.on('SIGTERM',()=>{server.close();void fixture.close().then(()=>process.exit(0));});
