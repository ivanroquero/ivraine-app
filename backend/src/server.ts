import { z } from 'zod';
import { createApp } from './app.js';
const env=z.object({SUPABASE_URL:z.url(),SUPABASE_PUBLISHABLE_KEY:z.string().min(20),FRONTEND_ORIGINS:z.string().min(1),PORT:z.coerce.number().int().min(1).max(65535).default(3001),TRUST_PROXY_HOPS:z.coerce.number().int().min(0).max(3).default(0)}).parse(process.env);
const origins=env.FRONTEND_ORIGINS.split(',').map(s=>new URL(s.trim()).origin);
const app=createApp({supabaseUrl:env.SUPABASE_URL,supabaseKey:env.SUPABASE_PUBLISHABLE_KEY,origins,trustProxy:env.TRUST_PROXY_HOPS});
const server=app.listen(env.PORT,'0.0.0.0',()=>console.log(`Ivraine API listening on ${env.PORT}`));
server.requestTimeout=30000;server.headersTimeout=15000;
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
