import {createDatabase,assertDatabaseCompatibility,publicCatalog,publicPhotoFeed,publicVisited,adminPlaces} from '/app/packages/gallery-db/src/index.server.ts';
import {createHash} from 'node:crypto';
const role=process.argv[2],service='gallery-'+role,db=createDatabase(process.env.GALLERY_DATABASE_URL,service);
try {await assertDatabaseCompatibility(db,service);const value=role==='public'?{catalog:await publicCatalog(db),feed:await publicPhotoFeed(db,{}),visited:await publicVisited(db)}:await adminPlaces(db);console.log(role+':'+createHash('sha256').update(JSON.stringify(value)).digest('hex'));}finally{await db.destroy();}
