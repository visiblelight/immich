import test from 'node:test';
import assert from 'node:assert/strict';
import {reuseCameraZone} from '../../gallery-core/src/capture-reuse.ts';
import type {CaptureEvidence} from '../../gallery-core/src/capture-evidence.ts';
const camera:CaptureEvidence={clock:'2017-01-23T18:21:37.000Z',explicitOffset:null,dateSource:'original:DateTimeOriginal',destinationZone:null,gpsUtc:null,gpsStatus:null,gpsPositionValid:false,gpsPositionMatches:false};
test('a confirmed source zone survives newly added, changed and removed locations',()=>{
  const input=JSON.stringify(camera);
  assert.deepEqual(reuseCameraZone(camera,{...camera,destinationZone:'Asia/Amman'},'UTC+08:00'),{takenAt:'2017-01-23T10:21:37.000Z',localTakenAt:'2017-01-23T12:21:37.000Z',timeZone:'Asia/Amman'});
  const fromLisbon={...camera,destinationZone:'Europe/Lisbon'};
  assert.equal(reuseCameraZone(fromLisbon,{...camera,destinationZone:'Europe/Madrid'},'UTC+08:00')!.localTakenAt,'2017-01-23T11:21:37.000Z');
  assert.deepEqual(reuseCameraZone(fromLisbon,camera,'UTC+08:00'),{takenAt:'2017-01-23T10:21:37.000Z',localTakenAt:camera.clock,timeZone:null});
  assert.equal(JSON.stringify(camera),input);
});
test('changed clocks, time evidence or ambiguous offsets cannot inherit a prior confirmation',()=>{
  for(const patch of [{clock:null},{clock:'2017-01-23T19:21:37.000Z'},{explicitOffset:120},{dateSource:'sidecar:DateTimeOriginal'},{gpsUtc:'2017-01-23T10:21:37.000Z'},{gpsStatus:'V'},{gpsPositionValid:true}])
    assert.equal(reuseCameraZone(camera,{...camera,...patch},'UTC+08:00'),null);
  const ambiguous={...camera,clock:'2026-11-01T01:30:00Z'};
  assert.equal(reuseCameraZone(ambiguous,{...ambiguous,destinationZone:'Europe/Lisbon'},'America/New_York'),null);
});
test('newly usable GPS cannot contradict the confirmed camera clock',()=>{
  const before={...camera,gpsUtc:'2017-01-23T16:21:37.000Z',gpsPositionValid:true};
  assert.equal(reuseCameraZone(before,{...before,gpsPositionMatches:true,destinationZone:'Asia/Amman'},'UTC+08:00'),null);
  const consistent={...before,gpsUtc:'2017-01-23T10:22:22.911Z'};
  assert.ok(reuseCameraZone(consistent,{...consistent,gpsPositionMatches:true,destinationZone:'Asia/Amman'},'UTC+08:00'));
});
