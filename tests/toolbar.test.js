import test from 'node:test';
import assert from 'node:assert/strict';
import {integrateToolbar} from '../scripts/toolbar.mjs';

test('toolbar integration mounts the actual Ciupaga view and preserves adjacent controls',()=>{
  const original='export default class Tabs extends View { init(_props, cx) { this.foo=1; } render(cx) { return h_flex().child(before).child(h_flex().id("ciupaga-launcher").child("Ciupaga")).child(after); } }';
  const result=integrateToolbar(original);
  assert.match(result,/cx\.new\(Ciupaga,\{role:'button',embedded:true\}\)/);
  assert.match(result,/\.child\(before\)/);assert.match(result,/\.child\(after\)/);
  assert.equal((result.match(/child\(this\.ciupaga\)/g)||[]).length,1);
  assert.equal(integrateToolbar(result),result);
  assert.throws(()=>integrateToolbar('unknown personal toolbar'),/Ciupaga launcher/);
});
