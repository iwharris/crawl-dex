import commander from 'commander';
import request from 'request';
import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import imagemagick from 'imagemagick';

const BASE_URL = 'https://pokeres.bastionbot.org/images/pokemon';
const FILE_EXT = 'png';
const CACHE_DIR = './.cache';
const MAX_POKEDEX_NUMBER = 807;

function assertDir(dirName: string): Promise<any> {
    return new Promise(resolve => mkdirp(dirName, resolve));
}

function getFileStats(path: string): Promise<fs.Stats>{
    return new Promise((resolve, reject) => fs.stat(path, (err, stats) => err ? reject(err) : resolve(stats)));
}

function downloadFile(uri: string, localPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        request.get({
            uri,
            gzip: true
        })
        .pipe(fs.createWriteStream(localPath))
        .on('finish', () => {
            resolve();
        })
        .on('error', (error: Error) => {
            reject(error);
        });
    });   
}

function downloadIfNeeded(uri: string, fileName: string): Promise<any> {
    const localPath = path.join(CACHE_DIR, fileName);
    return getFileStats(localPath)
        .catch(() => undefined)
        .then((stats) => {
            if (stats && stats.size > 0) {
                console.log(`Skipping ${fileName}.`);
                return Promise.resolve();
            }
            else {
                console.log(`Downloading ${fileName}.`)
                return downloadFile(uri, localPath)
                    .then(() => console.log(`Finished downloading ${fileName}.`));
            }
        });
}

function generateNumbers(max: number): number[] {
    return Array.from({ length: max }, (v, i) => i + 1);
}

function chunkArray<E = any>(array: E[], chunkSize: number): E[][] {
    let chunks = [];
    while (array.length) {
        chunks.push(array.splice(0, chunkSize));
    }

    return chunks;
}

function fetchImageForPokedexNumber(pokedexNumber: number): Promise<string> {
    const fileName = `${pokedexNumber}.${FILE_EXT}`;
    const localPath = path.join(CACHE_DIR, fileName);
    const uri = `${BASE_URL}/${fileName}`;
    return downloadIfNeeded(uri, fileName)
        .then(() => fileName);
}

function resizeImage(options: any = {}) {
    return new Promise((resolve, reject) => {
        imagemagick.resize(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        })
    })
}

async function fetchImages(): Promise<string[]> {
    await assertDir(CACHE_DIR);

    const pokedexNumbers = generateNumbers(MAX_POKEDEX_NUMBER);

    // Split download tasks into chunks
    const chunks = chunkArray(pokedexNumbers, 10);

    let filenames = [];
    while (chunks.length) {
        const promises = chunks.shift().map(fetchImageForPokedexNumber);
        const chunkFiles = await Promise.all(promises);
        filenames.push(...chunkFiles);
    }

    return filenames;
}

async function resizeImages(destDir: string, filenames: string[], opts: any) {
    await assertDir(destDir);

    // Split resize tasks into chunks
    const chunks = chunkArray(filenames, 10);

    while (chunks.length) {
        const promises = chunks.shift().map(async (filename) => {
            const destPath = path.join(destDir, filename);

            const stats = await getFileStats(destPath).catch(() => undefined);
            if (stats && stats.size) {
                console.log(`${filename} is already resized.`);
                return Promise.resolve();
            }

            const options = {
                ...opts,
                srcPath: path.join(CACHE_DIR, filename),
                dstPath: destPath,
            };

            return resizeImage(options)
                .then(() => console.log(`Resized ${filename}`));
        });

        await Promise.all(promises);
    }
}

function parseArgs(args: string[]): commander.Command {
    return commander
        .usage('[options]')
        .option('--width <width>', 'Resizes the image to fit within this width', 400)
        .option('--height <height>', 'Resizes the image to fit within this height', 400)
        .option('-d --dir <destDir>', 'Directory to put finished images in')
        .parse(args);
}

async function main() {
    const args = parseArgs(process.argv);
    const destDir = args.destDir || `${args.width}x${args.height}`;

    const filenames = await fetchImages();

    const resizeOpts = {
        width: args.width,
        height: args.height,
        dstPath: destDir,
        format: FILE_EXT
    };

    await resizeImages(destDir, filenames, resizeOpts);
    console.log(destDir)
    console.log('done');
}

main()
    .catch(err => console.error(err));
