import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReviewState,captureIsReading,type CaptureStateInput} from '../../gallery-core/src/capture-state.ts';
import {captureTime} from '../../gallery-core/src/capture-time.ts';
const base:CaptureStateInput={capture_status:'unknown',has_location:false,evidence:{clock:'2025-01-29T23:05:59Z'},refresh_state:null,refresh_expired:false};
test('missing destination alone never creates a manual review task',()=>{
  assert.equal(captureReviewState(base),'original');
  for(const capture_status of ['verified','confirmed'])assert.equal(captureReviewState({...base,capture_status}),'confirmed');
  assert.equal(captureReviewState({...base,capture_status:'suggested'}),'original');
  assert.equal(captureReviewState({...base,has_location:true}),'review','location does not tell us the camera setting');
  assert.equal(captureReviewState({...base,evidence:{clock:null}}),'review','missing camera time still needs attention');
  assert.equal(captureReviewState({...base,capture_status:'conflict'}),'review','conflicting evidence is not hidden');
  assert.equal(captureReviewState({...base,capture_status:'legacy'}),'legacy');
});
test('stale and active reads are updating; errors are distinct and allow retry',()=>{
  assert.equal(captureReviewState({...base,capture_status:'stale'}),'updating');
  for(const refresh_state of ['queued','reading']){
    assert.equal(captureReviewState({...base,refresh_state}),'updating');
    assert.equal(captureIsReading({...base,refresh_state}),true);
    assert.equal(captureReviewState({...base,refresh_state,refresh_expired:true}),'failed');
    assert.equal(captureIsReading({...base,refresh_state,refresh_expired:true}),false);
  }
  assert.equal(captureReviewState({...base,capture_status:'stale',refresh_state:'failed'}),'failed');
  assert.equal(captureReviewState({...base,capture_status:'verified',refresh_state:'completed'}),'confirmed');
});
test('public labels distinguish original clocks, active updating, and a genuine conflict',()=>{
  const p={localTakenAt:base.evidence!.clock,takenAt:null,timeZone:null};
  assert.match(captureTime({...p,captureStatus:'unknown'}).value,/23:05:59（时区未知）/);
  assert.match(captureTime({...p,captureStatus:'stale'}).value,/正在更新拍摄时间/);
  assert.doesNotMatch(captureTime({...p,captureStatus:'stale'}).value,/核对/);
  assert.match(captureTime({...p,captureStatus:'conflict'}).value,/待核对/);
});
