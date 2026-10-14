import { parseHttpRange } from '../../../server/proxy/rangeParser';
import { convertSrtToVtt } from '../../../server/subtitles/converter';

console.log('--- TEST 1: Bytes=0-100 ---');
console.log(parseHttpRange('Bytes=0-100', 1000));

console.log('--- TEST 2: bytes=0-100abc (garbage) ---');
console.log(parseHttpRange('bytes=0-100abc', 1000));

console.log('--- TEST 3: bytes=-100abc (garbage suffix) ---');
console.log(parseHttpRange('bytes=-100abc', 1000));

console.log('--- TEST 4: 5:20,500 ---');
console.log(convertSrtToVtt('1\n5:20,500 --> 5:25,800\nTexto'));
