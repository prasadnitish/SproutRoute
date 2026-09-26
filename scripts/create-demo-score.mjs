// Original, deterministic 60-second instrumental. No sampled third-party music.
// Run: node scripts/create-demo-score.mjs <output.wav>
import { writeFile } from 'node:fs/promises';
const rate = 44100, seconds = 60, beat = 60 / 112;
const left = new Float32Array(rate * seconds), right = new Float32Array(rate * seconds);
let seed = 260926;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const hz = note => 440 * 2 ** ((note - 69) / 12);
function add(start, duration, volume, pan, sample) {
  const offset = Math.round(start * rate);
  for (let i = 0; i < duration * rate && offset + i < left.length; i++) {
    const t = i / rate;
    const value = sample(t) * volume * Math.min(1, t / 0.005, (duration - t) / 0.03);
    left[offset + i] += value * Math.sqrt((1 - pan) / 2);
    right[offset + i] += value * Math.sqrt((1 + pan) / 2);
  }
}
const progression = [[53,57,60,64], [50,53,57,60], [55,59,62,65], [48,52,55,59]];
for (let b = 0; b < 112; b++) {
  const time = b * beat, bar = Math.floor(b / 4), chord = progression[Math.floor(bar / 2) % 4];
  const breakdown = time >= 48 && time < 54;
  add(time, .30, .48, 0, t => Math.sin(2*Math.PI*(48*t + 55*.025*(1-Math.exp(-t/.025)))) * Math.exp(-t*17));
  if (b % 2) add(time, .16, .15, .03, t => (noise()*.8 + Math.sin(2*Math.PI*175*t)*.2)*Math.exp(-t*25));
  for (const sub of [0,.5]) add(time + beat*sub, .055, breakdown ? .025 : .055, sub ? .4 : -.4, t => noise()*Math.exp(-t*65));
  const bass = chord[0] - 12 + ([0,0,7,12][b % 4]);
  add(time + (b%2 ? beat*.08 : 0), beat*.72, .30, -.05, t => (Math.sin(2*Math.PI*hz(bass)*t) + .18*Math.sin(4*Math.PI*hz(bass)*t))*Math.exp(-t*5));
  if (b%2 === 0) for (const [j,note] of chord.entries()) add(time + beat*.5 + j*.009, beat*.82, .055, (j-1.5)*.28, t => (Math.sin(2*Math.PI*hz(note)*t) + .2*Math.sin(6*Math.PI*hz(note)*t))*Math.exp(-t*4));
  if (!breakdown && bar > 1 && [0,1,3].includes(b%4)) {
    const note = chord[[2,3,1,2][b%4]]+12;
    add(time + beat*.75, .31, .065, .25, t => Math.sin(2*Math.PI*hz(note)*t + .8*Math.sin(2*Math.PI*hz(note)*2*t)*Math.exp(-t*18))*Math.exp(-t*9));
  }
}
// Soft, original tap accents on the edit's major reveals.
for (const t0 of [4,9,16.3,17,26,29.3,34,41,48,55]) add(t0, .18, .15, 0, t => Math.sin(2*Math.PI*(420*t-650*t*t))*Math.exp(-t*30));
const data = Buffer.alloc(44 + left.length * 4);
data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(2,22); data.writeUInt32LE(rate,24); data.writeUInt32LE(rate*4,28); data.writeUInt16LE(4,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(left.length*4,40);
for (let i=0;i<left.length;i++) {
  const t=i/rate, fade=Math.min(1,t/.05,(60-t)/1.5);
  data.writeInt16LE(Math.round(Math.tanh(left[i]*1.5)*25000*fade),44+i*4);
  data.writeInt16LE(Math.round(Math.tanh(right[i]*1.5)*25000*fade),46+i*4);
}
if (!process.argv[2]) throw new Error('An output .wav path is required');
await writeFile(process.argv[2],data);
console.log('Created original 112 BPM score, 60 seconds, stereo PCM.');
