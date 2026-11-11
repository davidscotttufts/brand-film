// Throwaway: how many frames each cut variant gives with this machine's ffmpeg-static.
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
const D = process.argv[2];
const run = (a) => spawnSync(ffmpegPath, a, { encoding: 'utf8' });
const frames = (f) => run(['-hide_banner', '-i', f, '-map', '0:v', '-c', 'copy', '-f', 'framecrc', '-']).stdout.split('\n').filter((l) => /^0,/.test(l)).length;
console.log(run(['-version']).stdout.split('\n')[0]);
run(['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=540x960:r=30:d=26', '-f', 'lavfi', '-i', 'sine=f=440:d=26:sample_rate=48000', '-ac', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', `${D}/src.mp4`]);
console.log('src', frames(`${D}/src.mp4`));
const R = [[0, 5.9], [14.2, 26]];
const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
const variants = {
  current: R.map(([a, b], i) => `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}]`).join(';') + ';[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
  split: '[0:v]split=2[s0][s1];[0:a]asplit=2[t0][t1];' + R.map(([a, b], i) => `[s${i}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}];[t${i}]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}]`).join(';') + ';[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
  videoOnly: R.map(([a, b], i) => `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}]`).join(';') + ';[v0][v1]concat=n=2:v=1:a=0[v]',
};
for (const [k, g] of Object.entries(variants)) {
  const r = run(['-y', '-loglevel', 'warning', '-i', `${D}/src.mp4`, '-filter_complex', g, '-map', '[v]', ...(k === 'videoOnly' ? [] : ['-map', '[a]', '-c:a', 'aac']), ...enc, `${D}/${k}.mp4`]);
  console.log(k, frames(`${D}/${k}.mp4`), r.stderr.trim().slice(0, 300));
}
