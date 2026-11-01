import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaptureMonitor} from '../src/lib/capture-monitor.ts';
import {captureReviewState, type CaptureStateInput} from '@gallery/core';

type Row=CaptureStateInput&{asset_id:string;source_signature:string};
const photo=(patch:Partial<Row>={}):Row=>({asset_id:'sony',source_signature:'before-gps',capture_status:'verified',has_location:false,evidence:{clock:'2025-01-29T23:05:59Z'},refresh_state:null,refresh_expired:false,...patch});
function fixture(initial:Row[]=[photo()]) {
  let current=initial,remote=initial,time=0,blocked=false,refreshes=0,readsFail=false,enqueueFails=false;
  const queued:string[][]=[],errors:string[]=[],finished:string[][]=[];
  const monitor=createCaptureMonitor({
    rows:()=>current,blocked:()=>blocked,now:()=>time,
    refresh:async()=>{refreshes++;if(readsFail)throw Error('offline');current=remote;},
    enqueue:async ids=>{queued.push(ids);if(enqueueFails)throw Error('offline');remote=remote.map(p=>ids.includes(p.asset_id)?{...p,refresh_state:'queued'}:p);},
    refreshed:()=>{finished.push(current.map(p=>captureReviewState(p)));},
    queued:()=>{},error:(stage,ids)=>{errors.push(stage+':'+ids.join(','));},
  });
  return {monitor,queued,errors,finished,get refreshes(){return refreshes;},get rows(){return current;},
    remote:(next:Row[])=>{remote=next;},advance:(ms:number)=>{time+=ms;},block:(value:boolean)=>{blocked=value;},
    failReads:(value:boolean)=>{readsFail=value;},failQueue:()=>{enqueueFails=true;}};
}
test('an idle page discovers added GPS, queues once, and refreshes its completed result',async()=>{
  const f=fixture();await f.monitor.tick();assert.equal(f.refreshes,1);
  f.remote([photo({source_signature:'lisbon-gps',has_location:true,capture_status:'stale'})]);
  f.advance(2500);await f.monitor.tick();assert.equal(f.refreshes,1,'idle polling is bounded');
  f.advance(12500);await f.monitor.tick();assert.deepEqual(f.queued,[['sony']]);
  assert.equal(captureReviewState(f.rows[0]!),'updating');
  f.advance(2500);await f.monitor.tick();assert.equal(f.queued.length,1,'queued source is not submitted twice');
  f.remote([photo({source_signature:'lisbon-gps',has_location:true,capture_status:'verified',refresh_state:'completed'})]);
  f.advance(2500);await f.monitor.tick();assert.equal(captureReviewState(f.rows[0]!),'confirmed');
  assert.ok(!f.rows.some(p=>captureReviewState(p)==='review'),'automatic work never becomes a manual task');
  assert.deepEqual(f.finished.at(-1),['confirmed']);
});
test('focus sees background-scan completion even without a refresh job',async()=>{
  const f=fixture([photo({capture_status:'stale'})]);
  f.remote([photo({capture_status:'verified',has_location:true})]);
  await f.monitor.tick(true);assert.equal(f.queued.length,0);assert.deepEqual(f.finished,[['confirmed']]);
});
test('a blocked page neither refreshes nor submits, and focus resumes immediately',async()=>{
  const f=fixture([photo({capture_status:'stale'})]);f.block(true);
  await f.monitor.tick(true);assert.equal(f.refreshes,0);assert.equal(f.queued.length,0);
  f.block(false);await f.monitor.tick(true);assert.equal(f.queued.length,1);
});
test('failed/expired jobs stay retryable without automatic loops; another source revision may be submitted',async()=>{
  const f=fixture([photo({capture_status:'stale',refresh_state:'failed'}),photo({asset_id:'expired',capture_status:'stale',refresh_state:'reading',refresh_expired:true})]);
  await f.monitor.tick();assert.equal(f.queued.length,0);assert.deepEqual(f.finished,[['failed','failed']]);
  const changed=photo({capture_status:'stale',source_signature:'new'});
  f.remote([changed]);await f.monitor.tick(true);assert.equal(f.queued.length,1);
  f.remote([changed]);await f.monitor.tick(true);assert.equal(f.queued.length,1,'same source gets one automatic attempt per page');
  f.remote([{...changed,source_signature:'newer'}]);await f.monitor.tick(true);assert.equal(f.queued.length,2);
});
test('queue failures identify affected rows, do not spam retries, and network refresh recovers',async()=>{
  const f=fixture([photo({capture_status:'stale'})]);f.failQueue();
  await f.monitor.tick();assert.deepEqual(f.errors,['enqueue:sony']);
  f.advance(2500);await f.monitor.tick();assert.equal(f.refreshes,1,'network failure backs off');
  f.advance(12500);await f.monitor.tick();assert.equal(f.queued.length,1,'manual retry remains available');
  f.failReads(true);await f.monitor.tick(true);assert.equal(f.errors.at(-1),'refresh:');
  f.failReads(false);await f.monitor.tick(true);assert.equal(f.refreshes,4);
});
test('more than 100 source changes use bounded batches',async()=>{
  const f=fixture(Array.from({length:101},(_,i)=>photo({asset_id:String(i),capture_status:'stale'})));
  await f.monitor.tick();assert.equal(f.queued[0]!.length,100);
  f.advance(2500);await f.monitor.tick();assert.deepEqual(f.queued[1],['100']);
});
test('concurrent refreshes and disposal cannot submit work after leaving the page',async()=>{
  let resolve!:()=>void,reads=0,queued=0,refreshed=0;
  const monitor=createCaptureMonitor({rows:()=>[photo({capture_status:'stale'})],blocked:()=>false,
    refresh:()=>{reads++;return new Promise<void>(r=>{resolve=r;});},enqueue:async()=>{queued++;},
    refreshed:()=>{refreshed++;},queued:()=>{},error:()=>{}});
  const pending=monitor.tick();await monitor.tick(true);assert.equal(reads,1);
  monitor.stop();resolve();await pending;await monitor.tick(true);
  assert.equal(reads,1);assert.equal(queued,0);assert.equal(refreshed,0);
});
