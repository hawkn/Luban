import Jimp from 'jimp';
import fs from 'fs';
import { Mesh } from './Mesh';
import { Vector2 } from '../../../shared/lib/math/Vector2';
import {
    BACK,
    CNC_IMAGE_NEGATIVE_RANGE_FIELD, BOTTOM, FRONT, LEFT, RIGHT, TOP
} from '../../constants';
import { pathWithRandomSuffix } from '../../../shared/lib/random-utils';
import DataStorage from '../../DataStorage';
import { round } from '../../../shared/lib/utils';
import { Line } from '../../../shared/lib/math/Line';
import { Slicer } from './Slicer';

/**
 * Calculate whether a point is inside the triangle
 * @returns {*}
 */
// eslint-disable-next-line no-unused-vars
function pointInTriangle(v0, v1, v2, p) {
    return Vector2.sameSide(v0, v1, p, v2) && Vector2.sameSide(v1, v2, p, v0) && Vector2.sameSide(v2, v0, p, v1);
}

/**
 * Get the plane function through 3 points
 * Ax + by + cz + d = 0
 * @returns {{A: number, B: number, C: number, D: number}}
 */
// eslint-disable-next-line no-unused-vars
function getPlane(v0, v1, v2) {
    const A = ((v1.y - v0.y) * (v2.z - v0.z) - (v1.z - v0.z) * (v2.y - v0.y));
    const B = ((v1.z - v0.z) * (v2.x - v0.x) - (v1.x - v0.x) * (v2.z - v0.z));
    const C = ((v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x));
    const D = (0 - (A * v0.x + B * v0.y + C * v0.z));
    return {
        A, B, C, D
    };
}

function getAngleRange(angle1, angle2, angle = 1) {
    const order = Math.abs(angle1 - angle2) < 180;
    let start, end;
    if (angle1 < angle2) {
        start = order ? angle1 : angle2;
        end = order ? angle2 : angle1 + 360;
    } else {
        start = order ? angle2 : angle1;
        end = order ? angle1 : angle2 + 360;
    }
    start = Math.ceil(start / angle);
    end = Math.floor(end / angle);

    return {
        start,
        end
    };
}

const getPointByLineAndAngle = (start, end, angle) => {
    const k2 = Math.tan(angle / 180 * Math.PI);
    if (start.x === end.x) {
        return {
            x: start.x,
            y: k2 * start.x
        };
    }
    if (start.y === end.y) {
        return {
            x: start.y / k2,
            y: start.y
        };
    }
    const k1 = (end.y - start.y) / (end.x - start.x);
    const b1 = end.y - k1 * end.x;
    if (k1 === k2) {
        return null;
    }
    return {
        x: b1 / (k2 - k1),
        y: (b1 / (k2 - k1)) * k2
    };
};

// eslint-disable-next-line no-unused-vars
const writeSvg = (width, height, paths, outputFile, p = '') => {
    let d = '';
    for (const eachPath of paths) {
        d += 'M';
        for (const point of eachPath) {
            d += `${point.x} ${point.y} `;
        }
    }
    const svg = `${`${`${`${'<svg xmlns="http://www.w3.org/2000/svg"\n'
        + '        width="'}${width}"\n`
        + '        height="'}${height}"\n`
        + '        viewBox="0,0,'}${width},${height}"\n`
        + '        version="1.1">\n'
        + '        <path d="'}${d}" stroke="#000000" \n`
        + '                fill="none" \n'
        + '                fill-rule="evenodd" \n'
        + '                stroke-width="0.1"/>\n'
        + '\n'
        + '      </svg>';

    fs.writeFileSync(`${DataStorage.tmpDir}/${p}${outputFile.replace('.png', '.svg')}`, svg, 'utf8');
};

export const DIRECTION_FACE_OPTIONS = {
    [FRONT]: { x: 'x', y: 'y', z: 'z' },
    [BACK]: { x: '-x', y: '-y', z: 'z' },
    [LEFT]: { x: '-y', y: 'x', z: 'z' },
    [RIGHT]: { x: 'y', y: '-x', z: 'z' },
    [TOP]: { x: 'x', y: '-z', z: 'y' },
    [BOTTOM]: { x: 'x', y: 'z', z: '-y' }
};

const PLACEMENT_FACE_OPTIONS = {
    [FRONT]: { x: '-x', y: '-z', z: '-y' },
    [BACK]: { x: '-x', y: 'z', z: 'y' },
    [LEFT]: { x: 'z', y: 'y', z: '-x' },
    [RIGHT]: { x: '-z', y: 'y', z: 'x' },
    [TOP]: { x: 'x', y: 'y', z: 'z' },
    [BOTTOM]: { x: '-x', y: 'y', z: '-z' }
};


export class MeshProcess {
    constructor(modelInfo) {
        const { uploadName, scale = 1, config = {}, transformation = {}, materials = {} } = modelInfo;

        const { isRotate, diameter } = materials;

        const { direction = FRONT, placement = BOTTOM, minGray = 0, maxGray = 255,
            sliceDensity = 5, extensionX = 0, extensionY = 0 } = config;

        this.uploadName = uploadName;
        this.direction = direction;
        this.placement = placement;
        this.minGray = minGray;
        this.maxGray = maxGray;
        this.extensionX = extensionX;
        this.extensionY = extensionY;
        this.sliceDensity = sliceDensity;
        this.transformation = transformation;
        this.scale = scale;

        this.flip = transformation.flip || 0;

        this.isRotate = isRotate;
        this.diameter = diameter;

        this.mesh = Mesh.loadSTLFile(`${DataStorage.tmpDir}/${uploadName}`);

        this._setDirection();

        if (!this.mesh) {
            throw new Error(`MeshProcess load uploadName: ${uploadName} failed`);
        }
    }

    getWidthAndHeight() {
        const mesh = this.mesh;

        if (this.isRotate) {
            const center = {
                x: (mesh.aabb.max.x + mesh.aabb.min.x) / 2,
                y: (mesh.aabb.max.y + mesh.aabb.min.y) / 2
            };
            let r2 = 0;
            for (const vertex of mesh.vertices) {
                r2 = Math.max(Vector2.length2({
                    x: vertex.p.x - center.x,
                    y: vertex.p.y - center.y
                }), r2);
            }

            const r = Math.sqrt(r2);

            const width = round(r * Math.PI * 2, 2);
            const height = this.mesh.aabb.length.z;
            return { width, height };
        } else {
            const width = this.mesh.aabb.length.x;
            const height = this.mesh.aabb.length.z;
            return { width, height };
        }
    }

    convertTo3AxisImage() {
        const { width, height } = this.getWidthAndHeight();

        const layerThickness = 1 / this.sliceDensity;
        const initialLayerThickness = layerThickness / 2;
        const imageWidth = Math.floor((width - initialLayerThickness) / layerThickness) + 1;
        const imageHeight = Math.floor((height - initialLayerThickness) / layerThickness) + 1;

        this.slicer = new Slicer(this.mesh, layerThickness, imageHeight, initialLayerThickness);

        const data = [];

        for (let j = 0; j < this.slicer.slicerLayers.length; j++) {
            const slicerLayer = this.slicer.slicerLayers[j];

            const polygons = [].concat(slicerLayer.polygons.data).concat(slicerLayer.polygonsPart.data).concat(slicerLayer.openPolygons.data);

            for (const polygon of polygons) {
                const size = polygon.size();

                for (let k = 0; k < size; k++) {
                    const p1 = polygon.get(k % size);
                    const p2 = polygon.get((k + 1) % size);

                    const start = Math.ceil((Math.min(p1.x, p2.x) - initialLayerThickness) / layerThickness);
                    const end = Math.floor((Math.max(p1.x, p2.x) - initialLayerThickness) / layerThickness);

                    const line = new Line(p1, p2);

                    for (let i = start; i <= end; i++) {
                        let y = line.getYByX(i * layerThickness + initialLayerThickness);

                        if (y === null) {
                            y = Math.max(p1.y, p2.y);
                        }
                        y = y < 0 ? 0 : y;

                        y = round(y, 2);

                        if (data[i] === undefined) {
                            data[i] = [];
                        }

                        if (data[i][j] === undefined) {
                            data[i][j] = y;
                        } else {
                            data[i][j] = Math.max(data[i][j], y);
                        }
                    }
                }
            }
        }

        const maxY = this.mesh.aabb.max.y;
        const grayRange = this.maxGray - this.minGray;

        this.outputFilename = `${pathWithRandomSuffix(this.uploadName).slice(0, -4)}.png`;

        return new Promise(resolve => {
            // eslint-disable-next-line no-new
            new Jimp(imageWidth, imageHeight, (err, image) => {
                for (let i = 0; i < imageWidth; i++) {
                    for (let j = 0; j < imageHeight; j++) {
                        const ii = i - this.extensionX;
                        const jj = imageHeight - 1 - (j - this.extensionY);
                        const idx = j * imageWidth * 4 + ii * 4;
                        const d = data[ii] && data[ii][jj] ? data[ii][jj] / maxY * grayRange + this.minGray : 0;

                        image.bitmap.data[idx] = d;
                        image.bitmap.data[idx + 1] = d;
                        image.bitmap.data[idx + 2] = d;
                        image.bitmap.data[idx + 3] = 255;
                    }
                }

                image.write(`${DataStorage.tmpDir}/${this.outputFilename}`, () => {
                    resolve({
                        filename: this.outputFilename,
                        width: width,
                        height: height
                    });
                });
            });
        });
    }

    convertTo4AxisImage() {
        const { width, height } = this.getWidthAndHeight();

        const r = width / (Math.PI * 2);

        const layerThickness = 1 / this.sliceDensity;
        const initialLayerThickness = layerThickness / 2;

        const imageWidth = Math.ceil(width * this.sliceDensity);
        const imageHeight = Math.floor((height - initialLayerThickness) / layerThickness) + 1;

        const slicer = new Slicer(this.mesh, layerThickness, imageHeight, initialLayerThickness);

        const data = [];
        const sliceAngle = 360 / imageWidth;

        for (let i = 0; i < slicer.slicerLayers.length; i++) {
            data[i] = [];
            const slicerLayer = slicer.slicerLayers[i];

            const polygons = [].concat(slicerLayer.polygonsPart.data).concat(slicerLayer.openPolygons.data);

            for (const polygon of polygons) {
                const ppath = polygon.path;
                for (let j = 0; j < ppath.length; j++) {
                    const start = ppath[j % ppath.length];
                    const end = ppath[(j + 1) % ppath.length];

                    const a1 = Vector2.angle(start);
                    const a2 = Vector2.angle(end);
                    if (!a1 || !a2 || Math.abs(a1 - a2) === 180) {
                        continue;
                    }
                    const range = getAngleRange(a1, a2, sliceAngle);
                    for (let a = range.start; a <= range.end; a++) {
                        const aa = (a * sliceAngle) % 360;
                        const hj = Math.round(aa / sliceAngle);

                        const p = getPointByLineAndAngle(start, end, aa);
                        if (!data[i][hj]) {
                            data[i][hj] = [];
                        }

                        const l = Vector2.length(p);

                        if (!data[i][hj][0]) {
                            data[i][hj][0] = l;
                        }

                        if (!data[i][hj][1]) {
                            data[i][hj][1] = l;
                        }

                        data[i][hj][0] = Math.max(l, data[i][hj][0]);
                        data[i][hj][1] = Math.min(l, data[i][hj][1]);
                    }
                }
            }
        }

        this.outputFilename = `${pathWithRandomSuffix(this.uploadName).slice(0, -4)}.png`;

        return new Promise(resolve => {
            // eslint-disable-next-line no-new
            new Jimp(imageWidth, imageHeight, (err, image) => {
                for (let i = 0; i < imageWidth; i++) {
                    for (let j = 0; j < imageHeight; j++) {
                        const idx = j * imageWidth * 4 + i * 4;
                        const h = imageHeight - 1 - j;
                        let d = 0;
                        let a = 255;
                        const k = (i + imageWidth / 2) % imageWidth;
                        if (data[h][i]) {
                            d = data[h][i][0] / r * 255;
                        } else if (data[h][k] && data[h][k][1] < data[h][k][0]) {
                            d = data[h][k][1] / r * 255;
                            a = CNC_IMAGE_NEGATIVE_RANGE_FIELD;
                        }

                        image.bitmap.data[idx] = d;
                        image.bitmap.data[idx + 1] = d;
                        image.bitmap.data[idx + 2] = d;
                        image.bitmap.data[idx + 3] = a;
                    }
                }

                image.write(`${DataStorage.tmpDir}/${this.outputFilename}`, () => {
                    resolve({
                        filename: this.outputFilename,
                        width: width,
                        height: height
                    });
                });
            });
        });
    }

    _setDirection() {
        this.mesh.setCoordinateSystem(this.isRotate ? PLACEMENT_FACE_OPTIONS[this.placement] : DIRECTION_FACE_OPTIONS[this.direction]);
        if ((this.flip & 1) > 0) {
            this.mesh.addCoordinateSystem({ z: '-z' });
        }
        if ((this.flip & 2) > 0) {
            this.mesh.addCoordinateSystem({ x: '-x' });
        }
    }

    convertToImage() {
        if (this.isRotate) {
            this.mesh.addCoordinateSystem(DIRECTION_FACE_OPTIONS[RIGHT]);
            this.mesh.offset({
                x: -(this.mesh.aabb.max.x + this.mesh.aabb.min.x) / 2,
                y: -(this.mesh.aabb.max.y + this.mesh.aabb.min.y) / 2,
                z: -this.mesh.aabb.min.z
            });
            this.mesh.resize({
                x: this.scale,
                y: this.scale,
                z: this.scale
            });
            return this.convertTo4AxisImage();
        } else {
            this.mesh.addCoordinateSystem({ y: '-y' });
            this.mesh.offset({
                x: -this.mesh.aabb.min.x,
                y: -this.mesh.aabb.min.y,
                z: -this.mesh.aabb.min.z
            });
            this.mesh.resize({
                x: this.scale,
                y: this.scale,
                z: this.scale
            });
            return this.convertTo3AxisImage();
        }
    }
}
