const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { execSync } = require('child_process');

try {
  execSync('"' + ffmpeg.path + '" -f lavfi -i "color=c=black:s=1280x720:d=5" -c:v h264_nvenc -preset fast -b:v 2M -f null - 2>&1');
} catch(e) {
  console.log('STDOUT:', e.stdout ? e.stdout.toString() : '');
  console.log('STDERR:', e.stderr ? e.stderr.toString() : '');
}
