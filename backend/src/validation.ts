import { z } from 'zod';
export const idSchema = z.uuid();
export const entrySchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(['memory', 'note', 'plan', 'date', 'song', 'voice']),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(12000).default(''),
  event_date: z.iso.date(),
  location: z.string().trim().max(160).default(''),
  photo_paths: z.array(z.string().max(220)).max(12).default([]),
  chapter: z.string().trim().max(80).default('Our story'),
  recurrence: z.enum(['none','monthly','yearly']).default('none'),
  song_url: z.string().max(2000).default('').refine(s=>!s || /^https:\/\//.test(s),'Use an HTTPS song link').refine(s=>{try{return !s || ['open.spotify.com','music.apple.com','www.youtube.com','youtube.com','youtu.be','music.youtube.com','soundcloud.com'].includes(new URL(s).hostname);}catch{return false;}},'Use a Spotify, Apple Music, YouTube, or SoundCloud link'),
  artist: z.string().trim().max(160).default(''),
  voice_url: z.string().max(2000).default('').refine(s=>!s || /^https:\/\//.test(s),'Use an HTTPS voice note link').refine(s=>{try{return !s || /^https:\/\/.+\.(mp3|m4a|wav|ogg|webm|aac)(\?.*)?$/i.test(s);}catch{return false;}},'Use a direct audio link for the voice note'),
  favorite: z.boolean().default(false),
  completed: z.boolean().default(false),
}).strict();
// Explicit optional fields: Zod defaults on the create schema must never run on PATCH.
export const patchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().max(12000).optional(),
  event_date: z.iso.date().optional(),
  location: z.string().trim().max(160).optional(),
  chapter: z.string().trim().max(80).optional(),
  recurrence: z.enum(['none','monthly','yearly']).optional(),
  artist: z.string().trim().max(160).optional(),
  song_url: z.string().max(2000).refine(s=>{try{return !s || (new URL(s).protocol==='https:' && ['open.spotify.com','music.apple.com','www.youtube.com','youtube.com','youtu.be','music.youtube.com','soundcloud.com'].includes(new URL(s).hostname));}catch{return false;}},'Use a supported HTTPS song link').optional(),
  voice_url: z.string().max(2000).refine(s=>{try{return !s || (new URL(s).protocol==='https:' && /^https:\/\/.+\.(mp3|m4a|wav|ogg|webm|aac)(\?.*)?$/i.test(s));}catch{return false;}},'Use a direct HTTPS audio link for the voice note').optional(),
  favorite: z.boolean().optional(),
  completed: z.boolean().optional(),
  updated_at: z.iso.datetime({offset:true}),
}).strict();
export function imageExtension(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'jpg';
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return 'webp';
  return null;
}
