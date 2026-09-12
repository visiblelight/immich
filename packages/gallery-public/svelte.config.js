import adapter from '@sveltejs/adapter-node';

// Candidate builds leave the running local preview's files intact.
const subdir = process.env.GALLERY_BUILD_SUBDIR;
if (subdir && !/^[a-z][a-z0-9-]*$/.test(subdir)) throw new Error('Invalid Gallery build subdirectory');
export default { kit: { adapter: adapter({ out: subdir ? `build/${subdir}` : 'build' }) } };
