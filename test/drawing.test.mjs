import test from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode, isDrawingName, read, withDrawing } from '../src/cloud-shared/drawing.mjs';

// The same expected text as JotDrop's checks (cloud/shared/drawing.test.mjs and android/checks/DrawingFormatCheck.kt).
test('the copied drawing format writes the same text as the app and the web app', () => {
  const drawing = { width: 1080, height: 1440, strokes: [{ color: '#1F2937', size: 10, points: [10, 20, 30.25, 40.5, 50, 60] }, { color: '#dc2626', size: 4.5, points: [500, 500] }] };
  const text = '{"v":1,"w":1080,"h":1440,"strokes":[{"c":"#1f2937","s":10,"p":[10,20,30.3,40.5,50,60]},{"c":"#dc2626","s":4.5,"p":[500,500]}]}';
  assert.equal(encode(drawing), text);
  assert.equal(encode(decode(text)), text);
  // A tiny PNG (1 x 1) with the drawing inside, read back.
  const plain = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  assert.equal(read(plain), null);
  assert.equal(encode(read(withDrawing(plain, drawing))), text);
  assert.ok(isDrawingName('drawing-2026-11-02 140501.png') && !isDrawingName('photo.png'));
});
