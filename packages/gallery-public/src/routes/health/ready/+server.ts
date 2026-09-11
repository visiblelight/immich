import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getRuntime } from '$lib/server/runtime';
export async function GET(){
  if(!env.GALLERY_DATABASE_URL)return json({service:'gallery-public',status:'not-ready',reason:'foundation-only'},{status:503,headers:{'cache-control':'no-store'}});
  try{await getRuntime().ready();return json({service:'gallery-public',status:'ready'},{headers:{'cache-control':'no-store'}});}catch{return json({service:'gallery-public',status:'not-ready',reason:'database-unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
}
