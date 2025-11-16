import archiver from 'archiver';
import StreamBuffers from 'stream-buffers';


export function createZipBuffer(filenameInZip, fileBuffer) {
return new Promise((resolve, reject) => {
try {
const writable = new StreamBuffers.WritableStreamBuffer({ initialSize: 100 * 1024, incrementAmount: 10 * 1024 });


const archive = archiver('zip', { zlib: { level: 9 } });
archive.on('error', (err) => reject(err));
archive.pipe(writable);


archive.append(fileBuffer, { name: filenameInZip });
archive.finalize();


writable.on('finish', () => {
const contents = writable.getContents();
if (!contents) return reject(new Error('Empty zip contents'));
const buf = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
resolve(buf);
});
} catch (err) {
reject(err);
}
});
}