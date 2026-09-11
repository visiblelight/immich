import { env } from '$env/dynamic/private';
import { runtime } from '@gallery/db/server';
let instance: ReturnType<typeof runtime> | undefined;
export const getRuntime = () => (instance ??= runtime(env, 'gallery-admin'));
