var WAVES = (function () {
    "use strict";

    var H_EVEN = 0,
        H_ODD = 1,
        V = 2,
        CELL_SIZE = 3,
        FORCE_SCALE = 0.4,
        DECAY_TIME = 200;

    function Boat() {
        var boatScale = R3.makeScale(0.02),
            bow = new R3.V(0.0, 1.0, 0.5),
            base = new R3.V(0.0, 0.0, -0.05),
            left = new R3.V(-0.5, -1.0, 0.02),
            right = new R3.V( 0.5, -1.0, 0.02),
            keel = R3.subVectors(bow, base),
            points = [
                bow, left, right,
                bow, left, base,
                bow, base, right,
                base, left, right
            ],
            faceNormals = [
                new R3.V(0, 0, 1),
                new R3.V(0, -1, 0),
                keel.cross(R3.subVectors(left, base)),
                keel.cross(R3.subVectors(left, keel))
            ],
            mesh = new WGL.Mesh();

        for (var p = 0; p < points.length; ++p) {
            var point = boatScale.transformP(points[p]);
            point.pushOn(mesh.vertices);
            mesh.bbox.envelope(point);
        }
        for (var n = 0; n < faceNormals.length; ++n) {
            var normal = faceNormals[n];
            normal.pushOn(mesh.normals);
            normal.pushOn(mesh.normals);
            normal.pushOn(mesh.normals);
        }
        mesh.uvs = [
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0,
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0,
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0,
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0
        ];
        mesh.tris = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        mesh.finalize(new R3.V(-0.5, -1, -0.05), new R3.V(0.5, 1, 0.2));
        this.mesh = mesh;
    }

    function RegionPoint(x, y) {
        this.x = x;
        this.y = y;
    }

    RegionPoint.prototype.includes = function(x, y) {
        return this.x == x && this.y == y;
    };

    RegionLineX.prototype.includes = function(x, y) {
        return this.x == x && this.y == y;
    };

    function RegionLineX(x, yMin, yMax) {
        this.x = x;
        this.yMin = yMin;
        this.yMax = yMax;
    }

    RegionLineX.prototype.includes = function(x, y) {
        return this.x == x && this.yMin <= y && y <= this.yMax;
    };

    function RegionLineY(y, xMin, xMax) {
        this.y = y;
        this.xMin = xMin;
        this.xMax = xMax;
    }

    RegionLineY.prototype.includes = function(x, y) {
        return this.y == y && this.xMin <= x && x <= this.xMax;
    };

    function Thumper(region, flip, frequency, amplitude) {
        this.frequency = frequency || Math.PI / 20;
        this.amplitude = amplitude || 0.0002;

        this.time = 0;
        this.active = false;

        this.flip = flip || false;
        this.region = region;
        this.lastValue = 0;
        this.delta = 0;
    }

    Thumper.prototype.scaleFrequency = function (factor) {
        this.frequency *= factor;
        this.time /= factor;
    };

    Thumper.prototype.scaleAmplitude = function (factor) {
        this.amplitude *= factor;
    };

    Thumper.prototype.includes = function (x, y) {
        return this.active && this.region.includes(x, y);
    };

    Thumper.prototype.update = function (elapsed) {
        this.time += elapsed;
        if (this.active) {
            var value = Math.sin(this.time * this.frequency) * this.amplitude,
                result = value - this.lastValue;
            this.lastValue = value;
            this.delta = this.flip ? -result : result;
        }
    };

    Thumper.prototype.start = function (reset) {
        if (reset) {
            this.stop();
        }
        this.active = true;
    };

    Thumper.prototype.stop = function () {
        this.active = false;
        this.time = 0;
        this.lastValue = 0;
        this.delta = 0;
    };

    function Damper(region, attenuation) {
        this.region = region;
        this.attenuation = attenuation;
    }

    Damper.prototype.includes = function (x, y) {
        return this.region.includes(x, y);
    };

    function View() {
        this.batch = new BLIT.Batch("images/");
        this.surfaceTexture = this.batch.load("wavy.png");
        this.batch.commit();

        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = false;
        this.updateInterval = 15;
        this.consumeKeys = true;
        this.canvasInputOnly = true;
        this.meshes = null;
        this.program = null;
        this.yAxisAngle = 0;
        this.xAxisAngle = -Math.PI/3.5;
        this.room = null;
        this.distance = 1.8;
        this.center = new R3.V(0, 0, 0);
        this.eyeHeight = -0.3;

        var self = this;

        this.cellsX = 250;
        this.cellsY = 250;
        this.cellCount = this.cellsX * this.cellsY;

        this.cells = new Float32Array(this.cellCount * CELL_SIZE);
        this.hA = H_EVEN;
        this.hB = H_ODD;
        this.surface = null;

        this.time = 0;

        this.dampenBoundary = false;

        this.clickThumper = new Thumper(new RegionPoint(this.cellsX / 2, this.cellsY / 2), true);
        this.ocean = new Thumper(new RegionLineY(0, 0, this.cellsX), false, Math.PI/100, 0.0001);

        this.thumpers = [this.clickThumper, this.ocean];

        this.boat = new Boat();

        this.surface = this.constructSurface();
        this.meshes = [this.surface, this.boat.mesh];
    }

    function updateMeshVertex(mesh, index, z, b) {
        mesh.vertices[index * 3 + 2] = z;
        mesh.colors[index * 4 + 0] = 1 - b;
        mesh.colors[index * 4 + 2] = b;
        mesh.updated = true;
    }

    View.prototype.propagate = function (elapsed) {
        var index = 0,
            hIn = this.hA,
            hOut = this.hB,
            lastX = this.cellsX - 1,
            lastY = this.cellsY - 1,
            decay = Math.max(0, (DECAY_TIME - elapsed) / DECAY_TIME);
        for (var y = 0; y < this.cellsY; ++y) {
            var yLow = y > 0 ? -1 : 0,
                yHi = y < lastY ? 1 : 0;
            for(var x = 0; x < this.cellsX; ++x) {
                var force = false,
                    i = index * CELL_SIZE,
                    prevH = this.cells[i + hIn],
                    prevV = this.cells[i + V],
                    newH = prevH,
                    newV = prevV;

                for (var t = 0; t < this.thumpers.length; ++t) {
                    var thumper = this.thumpers[t];
                    if (thumper.includes(x, y)) {
                        force = true;
                        newH = prevH + thumper.delta;
                        newV = thumper.delta / elapsed;
                        break;
                    }
                }

                if (!force) {
                    var hSum = -prevH,
                        count = -1,
                        xHi = x < lastX ? 1 : 0,
                        xLow = x > 0 ? -1 : 0;

                    for (var dy = yLow; dy <= yHi; ++dy) {
                        var yOffset = dy * this.cellsX;
                        for (var dx = xLow; dx <= xHi; ++dx) {
                            ++count;
                            var offset = ((dx + yOffset) * CELL_SIZE);
                            hSum += this.cells[i + offset + hIn];
                        }
                    }
                    if (this.dampenBoundary) {
                        count = 8;
                    }

                    var hDiff = (hSum / count) - prevH,
                        deltaV = hDiff * FORCE_SCALE * elapsed;
                    newV = prevV * decay + deltaV;
                    newH = prevH + newV * elapsed;

                }
                newH = Math.max(-1, Math.min(1, newH));

                this.cells[i + hOut] = newH;
                this.cells[i + V] = newV;

                if (this.surface) {
                    updateMeshVertex(this.surface, index, 500 * newH, (100000 * newV + 1) / 2);
                }
                ++index;
            }
        }
        this.hA = hOut;
        this.hB = hIn;
    };

    View.prototype.setRoom = function (room) {
        this.room = room;
    };

    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        var fixedTime = 2;
        this.time += fixedTime;

        if (keyboard.wasAsciiPressed("K")) {
            this.clickThumper.scaleFrequency(2);
        } else if(keyboard.wasAsciiPressed("J")) {
            this.clickThumper.scaleFrequency(0.5);
        }

        if (keyboard.wasAsciiPressed("M")) {
            this.clickThumper.scaleAmplitude(2);
        } else if(keyboard.wasAsciiPressed("N")) {
            this.clickThumper.scaleAmplitude(0.5);
        }

        if (keyboard.wasAsciiPressed("O")) {
            if (!this.ocean.active) {
                this.ocean.start(true);
            } else {
                this.ocean.stop();
            }
        }

        if (pointer.wheelY) {
        }

        if (pointer.primary) {
            var orientation = this.viewOrientation(),
                viewStab = this.room.stabDirection(pointer.primary.x, pointer.primary.y, "safe"),
                stabDir = R3.makeRotateQ(orientation.inverse()).transform(viewStab),
                stab = R3.makeRotateQ(orientation).transformP(this.viewPosition());
            stab.addScaled(stabDir, -stab.z / stabDir.z);

            var xCell = Math.round((stab.x + 1) * 0.5 * this.cellsX),
                yCell = Math.round((stab.y + 1) * 0.5 * this.cellsY);
            if (Math.abs(stab.x) < 1 && Math.abs(stab.y) < 1) {
                this.clickThumper.region = new RegionPoint(xCell, yCell);
                this.clickThumper.start();
            } else {
                this.clickThumper.stop();
            }
        } else {
            this.clickThumper.stop();
        }

        if (keyboard.isShiftDown()) {
        } else if(keyboard.isAltDown()) {
        }

        for (var t = 0; t < this.thumpers.length; ++t) {
            this.thumpers[t].update(fixedTime);
        }

        this.propagate(2);
    };

    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.program === null) {
            var shader = room.programFromElements("vertex-test", "fragment-test");
            this.program = {
                shader: shader,
                vertexPosition: room.bindVertexAttribute(shader, "aPos"),
                vertexNormal: room.bindVertexAttribute(shader, "aNormal"),
                vertexUV: room.bindVertexAttribute(shader, "aUV"),
                vertexColor: room.bindVertexAttribute(shader, "aColor"),
                textureVariable: "uSampler"
            };
            room.viewer.position.set(0, 0, 2);
            room.gl.enable(room.gl.CULL_FACE);
        }
        if (!this.batch.loaded) {
            return;
        }
        if (room.viewer.inVR()) {
            var vrFrame = room.viewer.vrFrame(),
                pivot = new R3.V(0, 0, this.eyeHeight),
                m = r3.identity();
            room.viewer.orientation.set(0, 0, 0, 1);
            room.viewer.position.set(0, 0, 0);

            m.translate(R3.toOrigin(pivot));
            m = R3.matmul(R3.makeRotateQ(R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0)), m);
            m.translate(new R3.V(0, 0, this.distance - this.center.z));

            var eyes = ["left", "right"],
                views = [vrFrame.leftViewMatrix, vrFrame.rightViewMatrix];
            for (var e = 0; e < eyes.length; ++e) {
                var viewMatrix = R3.matmul(new R3.M(views[e]), m);
                room.setupView(this.program.shader, eyes[e], "uMVMatrix", "uPMatrix", "uNormalMatrix", viewMatrix, vrFrame);
                this.drawMeshes(room);
            }
            room.viewer.submitVR();
        }
        room.viewer.orientation = this.viewOrientation();
        room.viewer.position = this.viewPosition();
        if (room.viewer.showOnPrimary()) {
            room.setupView(this.program.shader, "safe", "uMVMatrix", "uPMatrix", "uNormalMatrix");
            this.drawMeshes(room);
        }
    };

    View.prototype.viewOrientation = function () {
        return R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0);
    }

    View.prototype.viewPosition = function () {
        return new R3.V(0, this.eyeHeight, this.distance);
    };

    View.prototype.drawMeshes = function (room) {
        if (this.meshes !== null) {
            for (var m = 0; m < this.meshes.length; ++m) {
                room.drawMesh(this.meshes[m], this.program);
            }
        }
    };

    function calculateVertex(mesh, x, y, halfWidth, halfHeight) {
        var v = new R3.V(
            (x - halfWidth) / halfWidth,
            (y - halfHeight) / halfHeight,
            0
        );
        var normal = new R3.V(0, 0, 1);
        mesh.addVertex(v, normal, x / (2*halfWidth), y / (2*halfHeight), 1, 0, 0, 1);
    }

    function addTris(mesh, index, stride) {
        mesh.addTri(index,    index + stride, index + 1);
        mesh.addTri(index + 1,index + stride, index + stride + 1);
    }

    View.prototype.constructSurface = function () {
        var lastX = this.cellsX - 1,
            lastY = this.cellsY - 1,
            halfWidth = lastX * 0.5,
            halfHeight = lastY * 0.5,
            mesh = new WGL.Mesh();
        mesh.image = this.surfaceTexture;

        for (var y = 0; y < this.cellsY; ++y) {
            var generateTris = y < lastY;
            for (var x = 0; x < this.cellsX; ++x) {
                var generateTri = generateTris && x < lastX;
                if (generateTri) {
                    addTris(mesh, mesh.index, this.cellsX);
                }
                calculateVertex(mesh, x, y, halfWidth, halfHeight);
            }
        }
        return mesh;
    };

    window.onload = function(e) {
        var canvas = document.getElementById("canvas3D"),
            view = new View();

        canvas.tabIndex = 1000; // Hack to get canvas to accept keyboard input.
        view.inputElement = canvas;

        var room = MAIN.start(canvas, view);
        view.setRoom(room);
        MAIN.runTestSuites();
    };

    return {
    };
}());
