import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'VITE_');
 const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(key && (key.startsWith('sb_secret_') || (key.startsWith('eyJ') && (()=>{try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role';}catch{return false;}})())))throw new Error('Secret/service-role keys must never be included in a frontend build. Use a Supabase publishable key.');
 return {build:{target:'es2022'}};
});
