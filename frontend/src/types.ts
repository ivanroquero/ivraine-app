export type Kind='memory'|'note'|'plan'|'date'|'song';
export interface Entry {id:string;book_id:string;author_id:string;kind:Kind;title:string;body:string;event_date:string;location:string;photo_paths:string[];photo_urls:(string|null)[];chapter:string;recurrence:'none'|'monthly'|'yearly';song_url:string;artist:string;favorite:boolean;completed:boolean;created_at:string;updated_at:string;}
export interface Book {id:string;title:string;partner_one:string;partner_two:string;anniversary:string;}
export interface BookResponse {book:Book;member:{display_name:string;book_id:string};userId:string;}
