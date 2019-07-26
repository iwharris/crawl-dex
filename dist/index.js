"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = __importDefault(require("commander"));
const request_1 = __importDefault(require("request"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mkdirp_1 = __importDefault(require("mkdirp"));
const imagemagick_1 = __importDefault(require("imagemagick"));
const BASE_URL = 'https://pokeres.bastionbot.org/images/pokemon';
const FILE_EXT = 'png';
const CACHE_DIR = './.cache';
const MAX_POKEDEX_NUMBER = 807;
function assertDir(dirName) {
    return new Promise(resolve => mkdirp_1.default(dirName, resolve));
}
function getFileStats(path) {
    return new Promise((resolve, reject) => fs_1.default.stat(path, (err, stats) => err ? reject(err) : resolve(stats)));
}
function downloadFile(uri, localPath) {
    return new Promise((resolve, reject) => {
        request_1.default.get({
            uri,
            gzip: true
        })
            .pipe(fs_1.default.createWriteStream(localPath))
            .on('finish', () => {
            resolve();
        })
            .on('error', (error) => {
            reject(error);
        });
    });
}
function downloadIfNeeded(uri, fileName) {
    const localPath = path_1.default.join(CACHE_DIR, fileName);
    return getFileStats(localPath)
        .catch(() => undefined)
        .then((stats) => {
        if (stats && stats.size > 0) {
            console.log(`Skipping ${fileName}.`);
            return Promise.resolve();
        }
        else {
            console.log(`Downloading ${fileName}.`);
            return downloadFile(uri, localPath)
                .then(() => console.log(`Finished downloading ${fileName}.`));
        }
    });
}
function generateNumbers(max) {
    return Array.from({ length: max }, (v, i) => i + 1);
}
function chunkArray(array, chunkSize) {
    let chunks = [];
    while (array.length) {
        chunks.push(array.splice(0, chunkSize));
    }
    return chunks;
}
function fetchImageForPokedexNumber(pokedexNumber) {
    const fileName = `${pokedexNumber}.${FILE_EXT}`;
    const localPath = path_1.default.join(CACHE_DIR, fileName);
    const uri = `${BASE_URL}/${fileName}`;
    return downloadIfNeeded(uri, fileName)
        .then(() => fileName);
}
function resizeImage(options = {}) {
    return new Promise((resolve, reject) => {
        imagemagick_1.default.resize(options, (error, result) => {
            if (error)
                return reject(error);
            resolve(result);
        });
    });
}
function fetchImages() {
    return __awaiter(this, void 0, void 0, function* () {
        yield assertDir(CACHE_DIR);
        const pokedexNumbers = generateNumbers(MAX_POKEDEX_NUMBER);
        // Split download tasks into chunks
        const chunks = chunkArray(pokedexNumbers, 10);
        let filenames = [];
        while (chunks.length) {
            const promises = chunks.shift().map(fetchImageForPokedexNumber);
            const chunkFiles = yield Promise.all(promises);
            filenames.push(...chunkFiles);
        }
        return filenames;
    });
}
function resizeImages(destDir, filenames, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        yield assertDir(destDir);
        // Split resize tasks into chunks
        const chunks = chunkArray(filenames, 10);
        while (chunks.length) {
            const promises = chunks.shift().map((filename) => __awaiter(this, void 0, void 0, function* () {
                const destPath = path_1.default.join(destDir, filename);
                const stats = yield getFileStats(destPath).catch(() => undefined);
                if (stats && stats.size) {
                    console.log(`${filename} is already resized.`);
                    return Promise.resolve();
                }
                const options = Object.assign({}, opts, { srcPath: path_1.default.join(CACHE_DIR, filename), dstPath: destPath });
                return resizeImage(options)
                    .then(() => console.log(`Resized ${filename}`));
            }));
            yield Promise.all(promises);
        }
    });
}
function parseArgs(args) {
    return commander_1.default
        .usage('[options]')
        .option('--width <width>', 'Resizes the image to fit within this width', 400)
        .option('--height <height>', 'Resizes the image to fit within this height', 400)
        .option('-d --dir <destDir>', 'Directory to put finished images in')
        .parse(args);
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const args = parseArgs(process.argv);
        const destDir = args.destDir || `${args.width}x${args.height}`;
        const filenames = yield fetchImages();
        const resizeOpts = {
            width: args.width,
            height: args.height,
            dstPath: destDir,
            format: FILE_EXT
        };
        yield resizeImages(destDir, filenames, resizeOpts);
        console.log(destDir);
        console.log('done');
    });
}
main()
    .catch(err => console.error(err));
